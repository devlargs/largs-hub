import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  protocol,
  net,
  Menu,
  dialog,
  shell,
} from "electron";
import path from "path";
import fs from "fs";
import Store from "electron-store";
import { registerMessengerAutomation } from "./messengerAutomation";
import { registerNotionNotes, NotionNotesConfig } from "./notionNotes";
import { findBadgeAdapter, buildPollScript, parseTitleCount } from "./badge-adapters";
import {
  initNotificationCounts,
  reportNotificationCount,
  clearNotificationCount,
  resetDecreaseDebounce,
} from "./notificationCounts";

interface Service {
  id: string;
  name: string;
  url: string;
  icon: string;
  color: string;
  notificationCount: number;
  muted?: boolean;
  enabled?: boolean;
  notificationsEnabled?: boolean;
  blurWhenInactive?: boolean;
  // Internal services (e.g. "notion-notes") render as React pages in the UI
  // view instead of getting a WebContentsView
  type?: "notion-notes";
}

interface StoreSchema {
  services: Service[];
  sidebarWidth: number;
  windowBounds: { width: number; height: number; x?: number; y?: number };
  theme: "dark" | "light";
  downloadFolder: string;
  wakeServicesAutomatically: boolean;
  launchAtStartup: boolean;
  openFolderOnFinish: boolean;
  openFileOnFinish: boolean;
  downloadAlertOnFinish: boolean;
  // Minutes an inactive service view may sit idle before it's torn down to
  // reclaim its renderer process (0 = never hibernate). Session state survives
  // in the persist: partition, so the view reloads on next click.
  hibernateInactiveMinutes: number;
  notionNotes: Record<string, NotionNotesConfig>;
}

const store = new Store<StoreSchema>({
  defaults: {
    services: [],
    sidebarWidth: 68,
    windowBounds: { width: 1200, height: 800 },
    theme: "dark",
    downloadFolder: "",
    wakeServicesAutomatically: true,
    launchAtStartup: false,
    openFolderOnFinish: true,
    openFileOnFinish: false,
    downloadAlertOnFinish: true,
    hibernateInactiveMinutes: 0,
    notionNotes: {},
  },
});

app.setName("Largs Hub");
app.setAppUserModelId("com.largs-hub.app");

let mainWindow: BrowserWindow | null = null;
let uiView: WebContentsView | null = null;
let uiLayerRefCount = 0;
let linkPreviewView: WebContentsView | null = null;
const serviceViews = new Map<string, WebContentsView>();
// When each service view last stopped being the active one — drives hibernation
// of idle views. The active view is exempt and carries no entry while active.
const serviceLastActive = new Map<string, number>();
const HIBERNATION_SWEEP_MS = 60_000;
let hibernationSweepTimer: ReturnType<typeof setInterval> | null = null;
// Partitions whose persistent session already has the shared download listener.
// Sessions outlive individual views, so re-hooking when a view is recreated
// (URL change, disable→enable) would stack duplicate listeners that each fire
// the post-download side effects again.
const hookedDownloadSessions = new Set<string>();
let activeServiceId: string | null = null;
let windowFocused = true;

// Count state, debounce, and taskbar-badge rendering live in
// electron/notificationCounts.ts; extraction sources in createServiceView and
// electron/badge-adapters/ report into it.
initNotificationCounts({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
  isServiceNotificationsEnabled: (serviceId) =>
    store.get("services").find((s) => s.id === serviceId)?.notificationsEnabled !== false,
});
// Window bounds change on every resize/move tick; electron-store writes the
// whole config file synchronously, so coalesce those writes behind a debounce.
let pendingBounds: StoreSchema["windowBounds"] | null = null;
let boundsSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveBoundsDebounced(partial: Partial<StoreSchema["windowBounds"]>) {
  pendingBounds = { ...(pendingBounds ?? store.get("windowBounds")), ...partial };
  if (!boundsSaveTimer) {
    boundsSaveTimer = setTimeout(flushBounds, 500);
  }
}
function flushBounds() {
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  if (pendingBounds) {
    store.set("windowBounds", pendingBounds);
    pendingBounds = null;
  }
}
const SIDEBAR_WIDTH = 68;
const TITLEBAR_HEIGHT = 46;

function applyBlurToView(view: WebContentsView) {
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

function showDownloadToast(fileName: string) {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const toastWidth = 340;
  const toastHeight = 56;
  const margin = 16;
  const toast = new BrowserWindow({
    width: toastWidth,
    height: toastHeight,
    x: bounds.x + bounds.width - toastWidth - margin,
    y: bounds.y + bounds.height - toastHeight - margin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
  });
  // Escape HTML metacharacters, then URL-encode the whole document: a raw
  // "#" or "%" in a filename would otherwise truncate/corrupt the data: URL.
  const escaped = fileName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = `<html><body style="margin:0;font-family:Segoe UI,sans-serif;background:transparent;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(30,30,46,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#cdd6f4;font-size:13px;backdrop-filter:blur(12px);">
        <span style="color:#89b4fa;font-weight:600;white-space:nowrap;">Download complete</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a6adc8;">${escaped}</span>
      </div>
    </body></html>`;
  toast.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  toast.once("ready-to-show", () => {
    toast.showInactive();
    setTimeout(() => { if (!toast.isDestroyed()) toast.close(); }, 4000);
  });
}

function removeBlurFromView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  view.webContents.executeJavaScript(`
    (function() {
      const el = document.getElementById('__largs_blur_overlay__');
      if (el) el.remove();
    })()
  `).catch(() => {});
}

function createWindow() {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 480,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#181825",
    ...(process.env.NODE_ENV !== "development" && !process.argv.includes("--dev")
      ? { icon: path.join(__dirname, "../assets/ico/icon.ico") }
      : {}),
  });

  mainWindow.maximize();

  // Create the UI view (React app) as a WebContentsView for z-order control
  uiView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  uiView.setBackgroundColor("#00000000");
  mainWindow.contentView.addChildView(uiView);

  const resizeUiView = () => {
    if (!mainWindow || !uiView) return;
    const [width, height] = mainWindow.getContentSize();
    uiView.setBounds({ x: 0, y: 0, width, height });
  };
  resizeUiView();

  if (
    process.env.NODE_ENV === "development" ||
    process.argv.includes("--dev")
  ) {
    uiView.webContents.loadURL("http://localhost:5173");
  } else {
    uiView.webContents.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("resize", () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      saveBoundsDebounced({ width, height });
      resizeUiView();
      repositionActiveView();
      if (linkPreviewView) {
        linkPreviewView.setBounds(getLinkPreviewBounds());
      }
    }
  });

  // When the window regains focus (e.g. Alt+Tab), focus the active service view
  // so keyboard input goes to it (e.g. typing in a Messenger chat)
  mainWindow.on("focus", () => {
    windowFocused = true;
    mainWindow?.flashFrame(false); // Stop taskbar flashing
    if (activeServiceId) {
      const view = serviceViews.get(activeServiceId);
      if (view && !view.webContents.isDestroyed()) {
        removeBlurFromView(view);
        view.webContents.focus();
      }
    }
  });

  // When the window loses focus, blur the active service view (if enabled for that service)
  mainWindow.on("blur", () => {
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
  });

  mainWindow.on("move", () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      saveBoundsDebounced({ x, y });
    }
  });

  mainWindow.on("closed", () => {
    flushBounds(); // persist any bounds still buffered by the debounce
    if (hibernationSweepTimer) {
      clearInterval(hibernationSweepTimer);
      hibernationSweepTimer = null;
    }
    mainWindow = null;
    uiView = null;
    linkPreviewView = null;
    serviceViews.clear();
    serviceLastActive.clear();
  });

  hibernationSweepTimer = setInterval(sweepHibernation, HIBERNATION_SWEEP_MS);

  // Pre-load all saved services so they're warm on startup (if enabled)
  uiView.webContents.on("did-finish-load", () => {
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
  });
}

// When the Messenger automation panel is open the layout splits into a
// service pane (left) and the panel (right). The service view is resized to
// the left share so it stays visible instead of being hidden. The renderer
// computes the same ratio for the panel so the two panes always align.
// Keep AUTOMATION_SPLIT_RATIO in sync with MessengerAutomationPanel.tsx.
let automationSplitOpen = false;
const AUTOMATION_SPLIT_RATIO = 0.3;

function getAutomationInset() {
  if (!automationSplitOpen || !mainWindow) return 0;
  const [width] = mainWindow.getContentSize();
  return Math.round((width - SIDEBAR_WIDTH) * AUTOMATION_SPLIT_RATIO);
}

function getViewBounds() {
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: TITLEBAR_HEIGHT, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  return {
    x: SIDEBAR_WIDTH,
    y: TITLEBAR_HEIGHT,
    width: Math.max(0, width - SIDEBAR_WIDTH - getAutomationInset()),
    height: Math.max(0, height - TITLEBAR_HEIGHT),
  };
}

function repositionActiveView() {
  if (!activeServiceId) return;
  const view = serviceViews.get(activeServiceId);
  if (view) {
    view.setBounds(getViewBounds());
  }
}

// Link preview modal: the page renders in a WebContentsView layered on top,
// while the React UI draws the modal chrome (backdrop, header, close button)
// around it. Geometry must stay in sync with LinkPreviewModal.tsx.
const LINK_PREVIEW_MARGIN = 40;
const LINK_PREVIEW_HEADER = 52;

function getLinkPreviewBounds() {
  if (!mainWindow) return { x: 0, y: 0, width: 0, height: 0 };
  const [width, height] = mainWindow.getContentSize();
  const modalWidth = Math.min(1100, width - LINK_PREVIEW_MARGIN * 2);
  return {
    x: Math.round((width - modalWidth) / 2),
    y: LINK_PREVIEW_MARGIN + LINK_PREVIEW_HEADER,
    width: Math.max(0, modalWidth),
    height: Math.max(0, height - LINK_PREVIEW_MARGIN * 2 - LINK_PREVIEW_HEADER),
  };
}

function openLinkPreview(url: string, partition: string) {
  if (!mainWindow || !uiView) return;
  closeLinkPreview();

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#1e1e2e");

  const chromeVersion = process.versions.chrome;
  view.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
  );

  // Anything that tries to open a new window goes to the system browser
  view.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    shell.openExternal(popupUrl);
    return { action: "deny" };
  });

  view.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      closeLinkPreview();
    }
  });

  // Keep the URL shown in the modal header up to date
  view.webContents.on("did-navigate", (_event, navUrl) => {
    uiView?.webContents.send("link-preview-navigated", navUrl);
  });

  view.webContents.loadURL(url);
  mainWindow.contentView.addChildView(view);
  view.setBounds(getLinkPreviewBounds());
  linkPreviewView = view;

  uiView.webContents.send("link-preview-open", url);
}

function closeLinkPreview() {
  if (!linkPreviewView) return;
  if (mainWindow) {
    mainWindow.contentView.removeChildView(linkPreviewView);
  }
  linkPreviewView.webContents.close();
  linkPreviewView = null;
  uiView?.webContents.send("link-preview-closed");
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

  // Apply download folder setting — attach once per persistent session, since
  // the session (and this listener) outlives any single view recreation.
  if (!hookedDownloadSessions.has(partition)) {
    hookedDownloadSessions.add(partition);
    view.webContents.session.on("will-download", (_event, item) => {
      const downloadFolder = store.get("downloadFolder");
      if (downloadFolder) {
        item.setSavePath(path.join(downloadFolder, item.getFilename()));
      }
      item.on("done", (_e, state) => {
        if (state !== "completed") return;
        const savePath = item.getSavePath();
        if (store.get("openFolderOnFinish")) shell.showItemInFolder(savePath);
        if (store.get("openFileOnFinish")) shell.openPath(savePath);
        if (store.get("downloadAlertOnFinish") && mainWindow) {
          showDownloadToast(item.getFilename());
        }
      });
    });
  }

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
          click: () => openLinkPreview(params.linkURL, partition),
        });
      }
      menuItems.push({
        label: "Download File",
        click: () => view.webContents.downloadURL(params.linkURL),
      });
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow! });
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
          uiView?.webContents.send("service-switched", target.id);
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

    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  return view;
}

// Tear down an idle service view to reclaim its renderer process. The service
// stays enabled and in the store; only the live view goes. notificationCounts
// is kept so the sidebar badge survives until the view is reopened.
function hibernateServiceView(serviceId: string) {
  const view = serviceViews.get(serviceId);
  if (!view) return;
  if (mainWindow) {
    mainWindow.contentView.removeChildView(view);
  }
  view.webContents.close();
  serviceViews.delete(serviceId);
  serviceLastActive.delete(serviceId);
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

function showService(serviceId: string) {
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

function hideActiveService() {
  if (!mainWindow || !activeServiceId) return;
  const currentView = serviceViews.get(activeServiceId);
  if (currentView) {
    currentView.setVisible(false);
  }
  // Start the idle clock for the service we're leaving
  serviceLastActive.set(activeServiceId, Date.now());
  activeServiceId = null;
}

// --- IPC input validation ---------------------------------------------------
// IPC payload types are compile-time only; validate shapes at runtime before
// touching the store or creating views.

function isSafeServiceUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeService(raw: unknown): Service | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0) return null;
  if (typeof s.name !== "string" || s.name.length === 0) return null;
  if (s.type !== "notion-notes" && !isSafeServiceUrl(s.url)) return null;
  return {
    id: s.id,
    name: s.name,
    url: typeof s.url === "string" ? s.url : "",
    icon: typeof s.icon === "string" ? s.icon : "",
    color: typeof s.color === "string" ? s.color : "#888888",
    notificationCount: 0,
    muted: s.muted === true,
    enabled: s.enabled !== false,
    notificationsEnabled: s.notificationsEnabled !== false,
    ...(s.type === "notion-notes" ? { type: "notion-notes" as const } : {}),
  };
}

// IPC Handlers
ipcMain.handle("get-services", () => {
  return store.get("services");
});

ipcMain.handle("add-service", (_event, rawService: unknown) => {
  const services = store.get("services");
  const service = sanitizeService(rawService);
  if (!service) return services;
  if (services.some((s) => s.id === service.id)) return services;
  services.push(service);
  store.set("services", services);
  return services;
});

ipcMain.handle("remove-service", (_event, serviceId: string) => {
  const services = store.get("services").filter((s) => s.id !== serviceId);
  store.set("services", services);

  // Clean up the view
  const view = serviceViews.get(serviceId);
  if (view) {
    if (activeServiceId === serviceId) {
      activeServiceId = null;
    }
    if (mainWindow) {
      mainWindow.contentView.removeChildView(view);
    }
    view.webContents.close();
    serviceViews.delete(serviceId);
    serviceLastActive.delete(serviceId);
  }
  clearNotificationCount(serviceId);

  // Drop any Notion Note Taker credentials tied to this service
  const notionConfigs = store.get("notionNotes");
  if (notionConfigs[serviceId]) {
    delete notionConfigs[serviceId];
    store.set("notionNotes", notionConfigs);
  }

  return services;
});

ipcMain.handle("update-service", (_event, rawUpdated: unknown) => {
  const updated = sanitizeService(rawUpdated);
  if (!updated) return store.get("services");
  const old = store.get("services").find((s) => s.id === updated.id);
  const services = store
    .get("services")
    .map((s) => (s.id === updated.id ? updated : s));
  store.set("services", services);

  // If the URL changed, destroy the old view so it gets recreated with the new URL
  if (old && old.url !== updated.url) {
    const view = serviceViews.get(updated.id);
    if (view) {
      if (activeServiceId === updated.id) {
        activeServiceId = null;
      }
      if (mainWindow) {
        mainWindow.contentView.removeChildView(view);
      }
      view.webContents.close();
      serviceViews.delete(updated.id);
      serviceLastActive.delete(updated.id);
    }
  }

  return services;
});

ipcMain.handle("reorder-services", (_event, serviceIds: unknown) => {
  if (!Array.isArray(serviceIds) || !serviceIds.every((id) => typeof id === "string")) {
    return store.get("services");
  }
  const services = store.get("services");
  const reordered = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter(Boolean) as Service[];
  store.set("services", reordered);
  return reordered;
});

ipcMain.handle("toggle-mute-service", (_event, serviceId: string) => {
  const services = store.get("services");
  const updated = services.map((s) => {
    if (s.id === serviceId) {
      const muted = !s.muted;
      // Apply mute to the live view
      const view = serviceViews.get(serviceId);
      if (view) {
        view.webContents.setAudioMuted(muted);
      }
      return { ...s, muted };
    }
    return s;
  });
  store.set("services", updated);
  return updated;
});

ipcMain.handle("toggle-service-enabled", (_event, serviceId: string) => {
  const services = store.get("services");
  const updated = services.map((s) => {
    if (s.id === serviceId) {
      const enabled = s.enabled === false; // toggle: undefined/true -> false, false -> true
      if (!enabled) {
        // Destroy the view when disabling
        const view = serviceViews.get(serviceId);
        if (view) {
          if (activeServiceId === serviceId) {
            activeServiceId = null;
          }
          if (mainWindow) {
            mainWindow.contentView.removeChildView(view);
          }
          view.webContents.close();
          serviceViews.delete(serviceId);
          serviceLastActive.delete(serviceId);
        }
        clearNotificationCount(serviceId);
      }
      return { ...s, enabled };
    }
    return s;
  });
  store.set("services", updated);
  return updated;
});

ipcMain.handle("toggle-service-notifications", (_event, serviceId: string) => {
  const services = store.get("services");
  const updated = services.map((s) => {
    if (s.id === serviceId) {
      return { ...s, notificationsEnabled: s.notificationsEnabled === false };
    }
    return s;
  });
  store.set("services", updated);
  return updated;
});

ipcMain.on("show-service", (_event, serviceId: string) => {
  showService(serviceId);
});

ipcMain.handle("hide-service", () => {
  hideActiveService();
});

// Z-order control: bring the React UI layer above service views (for modals/menus)
// Ref-counted so nested overlays (context menu → modal) work correctly
// Z-order control: WebContentsView child reordering doesn't reliably
// control z-order on Windows, so we hide the active service view instead.
// Ref-counted so nested overlays (context menu → modal) work correctly.
ipcMain.on("bring-ui-to-front", () => {
  uiLayerRefCount++;
  // Always hide the active service view when any overlay is open
  if (activeServiceId) {
    const view = serviceViews.get(activeServiceId);
    if (view) view.setVisible(false);
  }
});

ipcMain.on("close-link-preview", () => {
  closeLinkPreview();
});

ipcMain.on("open-link-external", (_event, url: string) => {
  if (typeof url === "string" && /^https?:/i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on("send-ui-to-back", () => {
  uiLayerRefCount = Math.max(0, uiLayerRefCount - 1);
  // Only show the service view when ALL overlays are closed
  if (uiLayerRefCount === 0 && activeServiceId) {
    const view = serviceViews.get(activeServiceId);
    if (view) view.setVisible(true);
  }
});

// Native context menu for services — always renders on top of WebContentsViews
ipcMain.on("show-service-context-menu", (_event, serviceId: string) => {
  const services = store.get("services");
  const service = services.find((s) => s.id === serviceId);
  if (!service || !mainWindow || !uiView) return;

  const sendUpdated = () => {
    const updated = store.get("services");
    uiView?.webContents.send("services-updated", updated);
  };

  const menu = Menu.buildFromTemplate([
    { label: service.name, enabled: false },
    { type: "separator" },
    {
      label: "Enabled",
      type: "checkbox",
      checked: service.enabled !== false,
      click: () => {
        const svc = store.get("services").find((s) => s.id === serviceId);
        if (!svc) return;
        const enabled = svc.enabled === false;
        if (!enabled) {
          const view = serviceViews.get(serviceId);
          if (view) {
            if (activeServiceId === serviceId) activeServiceId = null;
            mainWindow!.contentView.removeChildView(view);
            view.webContents.close();
            serviceViews.delete(serviceId);
            serviceLastActive.delete(serviceId);
          }
          clearNotificationCount(serviceId);
        }
        const updated = store.get("services").map((s) =>
          s.id === serviceId ? { ...s, enabled } : s,
        );
        store.set("services", updated);
        uiView?.webContents.send("services-updated", updated);
        // If re-enabling the active service, show it
        if (enabled) {
          uiView?.webContents.send("context-menu-action", { action: "show-service", serviceId });
        }
      },
    },
    {
      label: "Sound",
      type: "checkbox",
      checked: !service.muted,
      click: () => {
        const muted = !service.muted;
        const view = serviceViews.get(serviceId);
        if (view) view.webContents.setAudioMuted(muted);
        const updated = store.get("services").map((s) =>
          s.id === serviceId ? { ...s, muted } : s,
        );
        store.set("services", updated);
        sendUpdated();
      },
    },
    {
      label: "Notifications",
      type: "checkbox",
      checked: service.notificationsEnabled !== false,
      click: () => {
        const updated = store.get("services").map((s) =>
          s.id === serviceId
            ? { ...s, notificationsEnabled: s.notificationsEnabled === false }
            : s,
        );
        store.set("services", updated);
        sendUpdated();
      },
    },
    {
      label: "Blur when inactive",
      type: "checkbox",
      checked: service.blurWhenInactive === true,
      click: () => {
        const svc = store.get("services").find((s) => s.id === serviceId);
        if (!svc) return;
        const blurWhenInactive = !svc.blurWhenInactive;
        const updated = store.get("services").map((s) =>
          s.id === serviceId ? { ...s, blurWhenInactive } : s,
        );
        store.set("services", updated);
        sendUpdated();
        // Apply/remove blur immediately if the window is already unfocused
        if (!windowFocused) {
          const view = serviceViews.get(serviceId);
          if (view && !view.webContents.isDestroyed()) {
            if (blurWhenInactive) applyBlurToView(view);
            else removeBlurFromView(view);
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "Edit service",
      click: () => {
        uiView?.webContents.send("context-menu-action", { action: "edit-service", serviceId });
      },
    },
    {
      label: "Reload",
      click: () => {
        const view = serviceViews.get(serviceId);
        if (view) view.webContents.reload();
      },
    },
    { type: "separator" },
    {
      label: "Remove service",
      click: async () => {
        if (!mainWindow) return;
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          buttons: ["Remove", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          title: "Remove service",
          message: `Remove ${service.name}?`,
          detail: "This will permanently remove the service from Largs Hub.",
        });
        if (response === 0) {
          uiView?.webContents.send("context-menu-action", { action: "remove-service", serviceId });
        }
      },
    },
  ]);

  menu.popup({ window: mainWindow! });
});

// Native settings menu
ipcMain.on("show-settings-menu", () => {
  if (!mainWindow || !uiView) return;
  const menu = Menu.buildFromTemplate([
    {
      label: "Check for Updates",
      click: () => {
        uiView?.webContents.send("context-menu-action", { action: "show-update-page", serviceId: "" });
      },
    },
  ]);
  menu.popup({ window: mainWindow! });
});

ipcMain.on("reload-service", (_event, serviceId: string) => {
  const view = serviceViews.get(serviceId);
  if (view) {
    view.webContents.reload();
  }
});

ipcMain.on("go-back", (_event, serviceId: string) => {
  const view = serviceViews.get(serviceId);
  if (view && view.webContents.canGoBack()) {
    view.webContents.goBack();
  }
});

ipcMain.on("go-forward", (_event, serviceId: string) => {
  const view = serviceViews.get(serviceId);
  if (view && view.webContents.canGoForward()) {
    view.webContents.goForward();
  }
});

// Theme
ipcMain.handle("get-theme", () => store.get("theme"));
ipcMain.handle("set-theme", (_event, theme: "dark" | "light") => {
  store.set("theme", theme);
});

// Settings
ipcMain.handle("get-settings", () => {
  return {
    downloadFolder: store.get("downloadFolder"),
    wakeServicesAutomatically: store.get("wakeServicesAutomatically"),
    launchAtStartup: store.get("launchAtStartup"),
    openFolderOnFinish: store.get("openFolderOnFinish"),
    openFileOnFinish: store.get("openFileOnFinish"),
    downloadAlertOnFinish: store.get("downloadAlertOnFinish"),
    hibernateInactiveMinutes: store.get("hibernateInactiveMinutes"),
  };
});

ipcMain.handle("update-setting", (_event, key: string, value: unknown) => {
  if (key === "downloadFolder" && typeof value === "string") {
    store.set("downloadFolder", value);
  } else if (key === "wakeServicesAutomatically" && typeof value === "boolean") {
    store.set("wakeServicesAutomatically", value);
  } else if (key === "launchAtStartup" && typeof value === "boolean") {
    store.set("launchAtStartup", value);
    app.setLoginItemSettings({ openAtLogin: value });
  } else if (key === "openFolderOnFinish" && typeof value === "boolean") {
    store.set("openFolderOnFinish", value);
  } else if (key === "openFileOnFinish" && typeof value === "boolean") {
    store.set("openFileOnFinish", value);
  } else if (key === "downloadAlertOnFinish" && typeof value === "boolean") {
    store.set("downloadAlertOnFinish", value);
  } else if (
    key === "hibernateInactiveMinutes" &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    store.set("hibernateInactiveMinutes", Math.floor(value));
  }
});

ipcMain.handle("select-download-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Download Folder",
    defaultPath: store.get("downloadFolder") || undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  store.set("downloadFolder", folder);
  return folder;
});

// Custom icons
const customIconsDir = path.join(app.getPath("userData"), "custom-icons");

// Resolve a user-supplied icon file name to a path safely contained inside
// customIconsDir. Returns null if the name would escape the directory.
function resolveCustomIconPath(fileName: unknown): string | null {
  if (typeof fileName !== "string" || fileName.length === 0) return null;
  // Strip any directory components (e.g. "../../evil") before joining
  const safeName = path.basename(fileName);
  if (safeName === "." || safeName === "..") return null;
  const filePath = path.resolve(customIconsDir, safeName);
  if (!filePath.startsWith(customIconsDir + path.sep)) return null;
  return filePath;
}

const ICON_DATA_URL_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/;

ipcMain.handle("save-custom-icon", async (_event, { fileName, dataUrl }: { fileName: string; dataUrl: string }) => {
  const filePath = resolveCustomIconPath(fileName);
  if (!filePath) throw new Error("Invalid icon file name");
  if (typeof dataUrl !== "string" || !ICON_DATA_URL_RE.test(dataUrl)) {
    throw new Error("Invalid icon data");
  }
  if (!fs.existsSync(customIconsDir)) {
    fs.mkdirSync(customIconsDir, { recursive: true });
  }
  const base64 = dataUrl.replace(ICON_DATA_URL_RE, "");
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  return filePath;
});

ipcMain.handle("delete-custom-icon", async (_event, fileName: string) => {
  const filePath = resolveCustomIconPath(fileName);
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

// Update check via GitHub API
// Pending update info is kept in the main process; the renderer only gets a
// boolean + version string and can never influence what gets downloaded.
let pendingUpdate: { url: string; sha256: string | null } | null = null;

const UPDATE_HOST_ALLOWLIST = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function isAllowedUpdateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && UPDATE_HOST_ALLOWLIST.has(parsed.hostname);
  } catch {
    return false;
  }
}

ipcMain.handle("check-for-updates", async () => {
  pendingUpdate = null;
  try {
    const response = await fetch(
      "https://api.github.com/repos/devlargs/largs-hub/releases/latest",
    );
    if (!response.ok) return { updateAvailable: false };
    const data = await response.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    const current = app.getVersion();
    if (latest && latest !== current) {
      const asset = data.assets?.find(
        (a: { name: string }) => a.name.endsWith(".exe") && !a.name.endsWith(".blockmap"),
      );
      const downloadUrl: string | undefined = asset?.browser_download_url;
      if (!downloadUrl || !isAllowedUpdateUrl(downloadUrl)) {
        return { updateAvailable: false };
      }
      // GitHub publishes a sha256 digest per release asset
      const digest: string | undefined = asset?.digest;
      pendingUpdate = {
        url: downloadUrl,
        sha256: digest?.startsWith("sha256:") ? digest.slice("sha256:".length) : null,
      };
      return { updateAvailable: true, version: latest, downloadUrl };
    }
    return { updateAvailable: false };
  } catch {
    return { updateAvailable: false };
  }
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("download-and-install-update", async () => {
  // The URL comes from the main-process check-for-updates result, never from
  // the renderer.
  if (!pendingUpdate) throw new Error("No update available. Run a check first.");
  const { url: updateUrl, sha256: expectedSha256 } = pendingUpdate;

  const fs = require("fs");
  const https = require("https");
  const crypto = require("crypto");
  const tmpPath = path.join(app.getPath("temp"), "largs-hub-update.exe");

  return new Promise<void>((resolve, reject) => {
    const MAX_REDIRECTS = 5;
    const follow = (url: string, redirectsLeft: number) => {
      if (!isAllowedUpdateUrl(url)) {
        reject(new Error("Update download blocked: untrusted or non-https URL"));
        return;
      }
      https.get(url, { headers: { "User-Agent": "Largs-Hub-Updater" } }, (res: any) => {
        // Follow redirects (GitHub uses 302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (redirectsLeft <= 0) {
            reject(new Error("Update download failed: too many redirects"));
            return;
          }
          return follow(res.headers.location, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        const hash = crypto.createHash("sha256");
        const file = fs.createWriteStream(tmpPath);

        res.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          hash.update(chunk);
          if (totalBytes > 0 && mainWindow) {
            uiView?.webContents.send("update-download-progress", {
              percent: Math.round((downloaded / totalBytes) * 100),
            });
          }
        });

        res.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            // Verify the download against the sha256 digest GitHub publishes
            // for the release asset before executing anything.
            const actualSha256 = hash.digest("hex");
            if (expectedSha256 && actualSha256 !== expectedSha256) {
              fs.unlink(tmpPath, () => {});
              reject(new Error("Update rejected: checksum mismatch"));
              return;
            }
            // Launch the NSIS installer silently in a fully detached process.
            // The installer will replace app files and auto-relaunch when done.
            const { spawn } = require("child_process");
            const child = spawn(tmpPath, ["/S"], {
              detached: true,
              stdio: "ignore",
              windowsHide: true,
            });
            child.unref();
            // Give the spawned process a moment to start before quitting
            setTimeout(() => {
              app.quit();
              resolve();
            }, 500);
          });
        });

        file.on("error", (err: Error) => {
          fs.unlink(tmpPath, () => {});
          reject(err);
        });
      }).on("error", reject);
    };

    follow(updateUrl, MAX_REDIRECTS);
  });
});

// Notion-backed note taker (internal "notion-notes" service)
registerNotionNotes(store);

// Messenger automation (scheduled/interval sends, call cycles)
registerMessengerAutomation({
  getServiceView: (serviceId) => serviceViews.get(serviceId),
  getServices: () => store.get("services"),
  getUiView: () => uiView,
});

// Split the layout into service (left) + automation panel (right) by resizing
// the active service view, so the service stays visible beside the panel.
ipcMain.on("set-automation-split", (_event, open: unknown) => {
  automationSplitOpen = open === true;
  repositionActiveView();
});

// Window controls
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow?.close());

app.whenReady().then(() => {
  // Register protocol to serve custom icon files
  protocol.handle("custom-icon", (request) => {
    const fileName = decodeURIComponent(request.url.replace("custom-icon://", ""));
    const filePath = path.join(app.getPath("userData"), "custom-icons", fileName);
    return net.fetch(`file://${filePath}`);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
