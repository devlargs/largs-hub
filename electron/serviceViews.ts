import { BrowserWindow, WebContentsView, Menu } from "electron";
import { shell } from "electron";
import { store, Service, isSafeServiceUrl } from "./store";
import { hookDownloadSession } from "./downloads";
import { findBadgeAdapter, buildPollScript, parseTitleCount } from "./badge-adapters";
import {
  reportNotificationCount,
  clearNotificationCount,
  resetDecreaseDebounce,
} from "./notificationCounts";

// Service-view lifecycle: creation (with UA spoofing, permission policy,
// notification extraction, popup handling), show/hide switching, hibernation,
// and layout. This module owns all per-view runtime state; main.ts owns the
// window and UI layer and injects them via initServiceViews.

interface ServiceViewDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
  openLinkPreview(url: string, partition: string): void;
}

let deps: ServiceViewDeps | null = null;

export function initServiceViews(d: ServiceViewDeps) {
  deps = d;
}

const serviceViews = new Map<string, WebContentsView>();
// When each service view last stopped being the active one — drives hibernation
// of idle views. The active view is exempt and carries no entry while active.
const serviceLastActive = new Map<string, number>();
const HIBERNATION_SWEEP_MS = 60_000;
let hibernationSweepTimer: ReturnType<typeof setInterval> | null = null;
let activeServiceId: string | null = null;
let windowFocused = true;

const SIDEBAR_WIDTH = 68;
const TITLEBAR_HEIGHT = 46;

// When the Messenger automation panel is open the layout splits into a
// service pane (left) and the panel (right). The service view is resized to
// the left share so it stays visible instead of being hidden. The renderer
// computes the same ratio for the panel so the two panes always align.
// Keep AUTOMATION_SPLIT_RATIO in sync with MessengerAutomationPanel.tsx.
let automationSplitOpen = false;
const AUTOMATION_SPLIT_RATIO = 0.3;

export function getServiceView(serviceId: string): WebContentsView | undefined {
  return serviceViews.get(serviceId);
}

export function getActiveServiceId(): string | null {
  return activeServiceId;
}

export function isWindowFocused(): boolean {
  return windowFocused;
}

export function setAutomationSplitOpen(open: boolean) {
  automationSplitOpen = open;
  repositionActiveView();
}

function getAutomationInset() {
  const mainWindow = deps?.getMainWindow();
  if (!automationSplitOpen || !mainWindow) return 0;
  const [width] = mainWindow.getContentSize();
  return Math.round((width - SIDEBAR_WIDTH) * AUTOMATION_SPLIT_RATIO);
}

function getViewBounds() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: TITLEBAR_HEIGHT, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  return {
    x: SIDEBAR_WIDTH,
    y: TITLEBAR_HEIGHT,
    width: Math.max(0, width - SIDEBAR_WIDTH - getAutomationInset()),
    height: Math.max(0, height - TITLEBAR_HEIGHT),
  };
}

export function repositionActiveView() {
  if (!activeServiceId) return;
  const view = serviceViews.get(activeServiceId);
  if (view) {
    view.setBounds(getViewBounds());
  }
}

export function applyBlurToView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  view.webContents.executeJavaScript(`
    (function() {
      if (document.getElementById('__largs_blur_overlay__')) return;
      const el = document.createElement('div');
      el.id = '__largs_blur_overlay__';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:2147483647;pointer-events:none;transition:opacity 0.15s ease;';
      document.documentElement.appendChild(el);
    })()
  `).catch(() => {});
}

export function removeBlurFromView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  view.webContents.executeJavaScript(`
    (function() {
      const el = document.getElementById('__largs_blur_overlay__');
      if (el) el.remove();
    })()
  `).catch(() => {});
}

// When the window regains focus (e.g. Alt+Tab), focus the active service view
// so keyboard input goes to it (e.g. typing in a Messenger chat)
export function handleWindowFocus() {
  windowFocused = true;
  if (activeServiceId) {
    const view = serviceViews.get(activeServiceId);
    if (view && !view.webContents.isDestroyed()) {
      removeBlurFromView(view);
      view.webContents.focus();
    }
  }
}

// When the window loses focus, blur the active service view (if enabled for that service)
export function handleWindowBlur() {
  windowFocused = false;
  if (activeServiceId) {
    const service = store.get("services").find((s) => s.id === activeServiceId);
    if (service?.blurWhenInactive) {
      const view = serviceViews.get(activeServiceId);
      if (view && !view.webContents.isDestroyed()) {
        applyBlurToView(view);
      }
    }
  }
}

// Z-order rule (see CLAUDE.md): overlays can't reliably stack above service
// views on Windows, so React modals hide the active view instead.
export function setActiveViewVisible(visible: boolean) {
  if (!activeServiceId) return;
  const view = serviceViews.get(activeServiceId);
  if (view) view.setVisible(visible);
}

// Session-level listeners must only be registered once per partition.
function createServiceView(service: Service): WebContentsView {
  const partition = `persist:service-${service.id}`;

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#00000000");

  // Spoof user agent so sites like Google and WhatsApp don't reject Electron
  const chromeVersion = process.versions.chrome;
  const spoofedUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  view.webContents.setUserAgent(spoofedUA);

  // Also set at session level so OAuth popups inherit the spoofed UA
  view.webContents.session.setUserAgent(spoofedUA);

  // Deny-by-default permission policy. Without a handler Electron grants
  // whatever the page asks for (camera, mic, geolocation, clipboard, ...).
  // Setting the handler is idempotent per session, so calling it again on
  // view recreation is safe.
  const allowedPermissions = new Set<string>(["notifications", "fullscreen", "clipboard-sanitized-write"]);
  try {
    const host = new URL(service.url).hostname;
    // Messenger / WhatsApp need camera+mic for calls
    if (/(^|\.)messenger\.com$|(^|\.)facebook\.com$|(^|\.)whatsapp\.com$/.test(host)) {
      allowedPermissions.add("media");
    }
  } catch {
    // invalid URL — keep the restrictive default
  }
  view.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
  view.webContents.session.setPermissionCheckHandler((_wc, permission) =>
    allowedPermissions.has(permission),
  );

  if (isSafeServiceUrl(service.url)) {
    view.webContents.loadURL(service.url);
  }

  // Apply mute state
  if (service.muted) {
    view.webContents.setAudioMuted(true);
  }

  hookDownloadSession(view, partition);

  // Context menu for service views
  view.webContents.on("context-menu", (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    if (params.mediaType === "image") {
      menuItems.push(
        {
          label: "Copy Image",
          click: () => view.webContents.copyImageAt(params.x, params.y),
        },
        {
          label: "Save Image",
          click: () => view.webContents.downloadURL(params.srcURL),
        },
      );
    }

    if (params.linkURL) {
      if (/^https?:/i.test(params.linkURL)) {
        menuItems.push({
          label: "View Link",
          click: () => deps?.openLinkPreview(params.linkURL, partition),
        });
      }
      menuItems.push({
        label: "Download File",
        click: () => view.webContents.downloadURL(params.linkURL),
      });
    }

    if (menuItems.length > 0) {
      const mainWindow = deps?.getMainWindow();
      if (mainWindow) {
        Menu.buildFromTemplate(menuItems).popup({ window: mainWindow });
      }
    }
  });

  // --- Notification count extraction (electron/badge-adapters/) ------------
  // Extraction is separated from badge state/rendering (notificationCounts.ts):
  // the sources below only ever report a raw count. Three sources, in order of
  // authority:
  //   1. adapter.fetchCount — main-process source (e.g. Gmail's Atom feed);
  //      while it's delivering, title/DOM readings are ignored so the two
  //      can't fight over the badge (issue #26)
  //   2. title "(N)" — instant via page-title-updated, works for most apps
  //   3. adapter.pollScript — targeted DOM selectors for apps whose title
  //      isn't reliable (WhatsApp, Messenger)
  let serviceHost = "";
  try {
    serviceHost = new URL(service.url).hostname.replace(/^www\./, "");
  } catch {
    // invalid URL — no adapter, title extraction still applies
  }
  const adapter = findBadgeAdapter(serviceHost);

  // Timestamp of the last successful fetchCount. Title/DOM readings are
  // suppressed while this is fresh; if the fetcher starts failing (logged out,
  // endpoint changed), it goes stale and scraping takes over automatically.
  let lastDirectFetch = 0;
  const DIRECT_FETCH_INTERVAL_MS = 20_000;
  const DIRECT_FETCH_FRESH_MS = DIRECT_FETCH_INTERVAL_MS * 3;
  const directFetchIsFresh = () => Date.now() - lastDirectFetch < DIRECT_FETCH_FRESH_MS;

  view.webContents.on("page-title-updated", (_event, title) => {
    if (directFetchIsFresh()) return;
    reportNotificationCount(service.id, parseTitleCount(title));
  });

  // Poll for apps that don't reliably put counts in the title. The script is
  // title check + the adapter's targeted selectors — no broad heuristics.
  const pollScript = buildPollScript(adapter);
  const pollInterval = setInterval(() => {
    if (!view.webContents || view.webContents.isDestroyed()) {
      clearInterval(pollInterval);
      return;
    }
    view.webContents.executeJavaScript(pollScript, true)
      .then((count: number) => {
        if (directFetchIsFresh()) return;
        reportNotificationCount(service.id, count);
      })
      .catch(() => {});
  }, 3000);

  // Main-process count source (no DOM involved), polled less aggressively
  // since it hits the network rather than the local page.
  let directFetchInterval: ReturnType<typeof setInterval> | null = null;
  if (adapter?.fetchCount) {
    const fetchCount = adapter.fetchCount.bind(adapter);
    const fetchDirect = async () => {
      if (view.webContents.isDestroyed()) return;
      const count = await fetchCount(view.webContents.session);
      if (count !== null && !view.webContents.isDestroyed()) {
        lastDirectFetch = Date.now();
        reportNotificationCount(service.id, count);
      }
    };
    directFetchInterval = setInterval(() => void fetchDirect(), DIRECT_FETCH_INTERVAL_MS);
    // Prime once the page loads (login cookies present) instead of waiting a
    // full interval for the first accurate badge.
    view.webContents.once("did-finish-load", () => void fetchDirect());
  }

  // Clear the polls as soon as the view is torn down instead of waiting for
  // the next tick to notice the destroyed webContents.
  view.webContents.once("destroyed", () => {
    clearInterval(pollInterval);
    if (directFetchInterval) clearInterval(directFetchInterval);
  });

  // Intercept Ctrl+Number shortcuts so they work even when a service view has focus
  view.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.control &&
      !input.shift &&
      !input.alt &&
      !input.meta
    ) {
      const num = parseInt(input.key, 10);
      if (num >= 1 && num <= 9) {
        const services = store.get("services");
        const target = services[num - 1];
        if (target) {
          event.preventDefault();
          showService(target.id);
          deps?.getUiView()?.webContents.send("service-switched", target.id);
        }
      }
    }
  });

  // Handle popups: navigate in-app for known domains, open external for others
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const serviceHost = new URL(service.url).hostname.replace(/^www\./, "");
      const popupHost = parsed.hostname.replace(/^www\./, "");

      const isServiceDomain = popupHost.endsWith(serviceHost) || serviceHost.endsWith(popupHost);

      const allowedDomains = [
        "google.com", "googleapis.com", "gstatic.com",
        "facebook.com", "fbcdn.net", "messenger.com",
        "apple.com", "icloud.com",
        "microsoft.com", "live.com", "microsoftonline.com",
        "github.com",
        "slack.com",
        "discord.com", "discordapp.com",
        "telegram.org",
        "linkedin.com",
        "twitter.com", "x.com",
        "notion.so", "notion-static.com",
        "reddit.com", "redditstatic.com",
        "whatsapp.com", "whatsapp.net",
      ];

      const isAllowed = allowedDomains.some((d) => popupHost === d || popupHost.endsWith("." + d));

      if (isServiceDomain || isAllowed) {
        // Navigate the current view instead of opening a popup window
        view.webContents.loadURL(url);
        return { action: "deny" };
      }
    } catch {}

    shell.openExternal(url);
    return { action: "deny" };
  });

  return view;
}

// Destroy a service's live view (used on removal, disable, and URL change).
// The stored service is untouched; pass clearCounts to also drop its badge.
export function destroyServiceView(serviceId: string, options?: { clearCounts?: boolean }) {
  const view = serviceViews.get(serviceId);
  if (view) {
    if (activeServiceId === serviceId) {
      activeServiceId = null;
    }
    const mainWindow = deps?.getMainWindow();
    if (mainWindow) {
      mainWindow.contentView.removeChildView(view);
    }
    view.webContents.close();
    serviceViews.delete(serviceId);
    serviceLastActive.delete(serviceId);
  }
  if (options?.clearCounts) {
    clearNotificationCount(serviceId);
  }
}

// Tear down an idle service view to reclaim its renderer process. The service
// stays enabled and in the store; only the live view goes. Notification counts
// are kept so the sidebar badge survives until the view is reopened.
function hibernateServiceView(serviceId: string) {
  if (!serviceViews.has(serviceId)) return;
  destroyServiceView(serviceId);
  resetDecreaseDebounce(serviceId);
}

// Periodically hibernate views that have been inactive past the user's chosen
// threshold. The active view is always exempt.
function sweepHibernation() {
  const minutes = store.get("hibernateInactiveMinutes");
  if (!minutes || minutes <= 0) return;
  const cutoff = Date.now() - minutes * 60_000;
  for (const serviceId of [...serviceViews.keys()]) {
    if (serviceId === activeServiceId) continue;
    const last = serviceLastActive.get(serviceId);
    // No timestamp yet (just created) — record now and give it a full interval
    if (last === undefined) {
      serviceLastActive.set(serviceId, Date.now());
      continue;
    }
    if (last <= cutoff) hibernateServiceView(serviceId);
  }
}

export function startHibernationSweep() {
  if (!hibernationSweepTimer) {
    hibernationSweepTimer = setInterval(sweepHibernation, HIBERNATION_SWEEP_MS);
  }
}

export function stopHibernationSweep() {
  if (hibernationSweepTimer) {
    clearInterval(hibernationSweepTimer);
    hibernationSweepTimer = null;
  }
}

export function showService(serviceId: string) {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return;

  // Internal services render as React pages in the UI view — just make sure
  // no web view is covering them
  const requested = store.get("services").find((s) => s.id === serviceId);
  if (requested?.type === "notion-notes") {
    hideActiveService();
    return;
  }

  // Hide current view
  if (activeServiceId) {
    const currentView = serviceViews.get(activeServiceId);
    if (currentView) {
      currentView.setVisible(false);
    }
    // Start the idle clock for the service we're switching away from
    serviceLastActive.set(activeServiceId, Date.now());
  }

  // Show or create requested view
  let view = serviceViews.get(serviceId);
  if (!view) {
    const services = store.get("services");
    const service = services.find((s) => s.id === serviceId);
    if (!service || service.enabled === false) return;
    view = createServiceView(service);
    serviceViews.set(serviceId, view);
    serviceLastActive.set(serviceId, Date.now());
    mainWindow.contentView.addChildView(view);
  }

  view.setVisible(true);
  view.setBounds(getViewBounds());
  if (windowFocused) {
    view.webContents.focus();
  } else {
    const service = store.get("services").find((s) => s.id === serviceId);
    if (service?.blurWhenInactive) applyBlurToView(view);
    else removeBlurFromView(view);
  }
  activeServiceId = serviceId;
}

export function hideActiveService() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow || !activeServiceId) return;
  const currentView = serviceViews.get(activeServiceId);
  if (currentView) {
    currentView.setVisible(false);
  }
  // Start the idle clock for the service we're leaving
  serviceLastActive.set(activeServiceId, Date.now());
  activeServiceId = null;
}

// Pre-load all saved services so they're warm on startup (if enabled)
export function preloadServices() {
  const mainWindow = deps?.getMainWindow();
  if (!store.get("wakeServicesAutomatically")) return;
  const services = store.get("services");
  for (const service of services) {
    if (service.type === "notion-notes") continue; // internal — no web view
    if (!serviceViews.has(service.id) && mainWindow && service.enabled !== false) {
      const view = createServiceView(service);
      serviceViews.set(service.id, view);
      serviceLastActive.set(service.id, Date.now());
      mainWindow.contentView.addChildView(view);
      view.setVisible(false);
    }
  }
}

// Drop all runtime view state (window closed). Views themselves die with the
// window; this just clears the bookkeeping.
export function clearAllViewState() {
  serviceViews.clear();
  serviceLastActive.clear();
  activeServiceId = null;
}
