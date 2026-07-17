import { BrowserWindow, WebContentsView, Menu } from "electron";
import { shell } from "electron";
import { store, Service, isSafeServiceUrl } from "./store";
import { hookDownloadSession } from "./downloads";
import { findBadgeAdapter, buildPollScript, parseTitleCount } from "./badge-adapters";
import { messengerAdapter } from "./badge-adapters/messenger";
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

// One in-app call window per service partition. Reused so a call cycle that
// re-clicks the call button focuses the open call instead of stacking windows.
const callWindows = new Map<string, BrowserWindow>();

// Meta's /groupcall/ page opens on a "Ready to call?" screen with a "Start
// call" button — the call isn't placed until it's clicked. To make the call
// actually connect automatically (the whole point of the feature), poll for
// that button once the page loads and click it. Resolves true once clicked so
// the caller stops re-injecting; the button is gone once in-call, so a stray
// extra run is a no-op.
const AUTO_START_CALL_SCRIPT = `
  (() => new Promise((resolve) => {
    const deadline = Date.now() + 15000;
    const scan = () => {
      for (const el of document.querySelectorAll('div[role="button"], button')) {
        const label = (el.getAttribute('aria-label') || '').trim();
        const text = (el.textContent || '').trim();
        if (/^start call$/i.test(label) || /^start call$/i.test(text)) {
          el.click();
          resolve(true);
          return;
        }
      }
      if (Date.now() < deadline) setTimeout(scan, 300);
      else resolve(false);
    };
    scan();
  }))()
`;

// Open a Messenger/Facebook call in a dedicated in-app BrowserWindow instead of
// the system browser. A fresh window with no window.opener link to the service
// page can't be reset back to about:blank by Meta's opener (the reason in-view
// rendering fails — see the did-create-window handler), and it shares the
// service's session partition so the user stays logged in. WebRTC + camera/mic
// work because it's a real Chromium window and the partition's permission
// handler already allows media for these hosts.
function openCallWindow(callUrl: string, partition: string, spoofedUA: string) {
  const existing = callWindows.get(partition);
  if (existing && !existing.isDestroyed()) {
    existing.loadURL(callUrl);
    existing.show();
    existing.focus();
    return;
  }

  const mainWindow = deps?.getMainWindow();
  const callWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 480,
    minHeight: 400,
    title: "Call",
    backgroundColor: "#181825",
    autoHideMenuBar: true,
    ...(mainWindow ? { parent: mainWindow } : {}),
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  callWindow.setMenuBarVisibility(false);
  callWindow.webContents.setUserAgent(spoofedUA);
  // Keep the call contained: nested popups go to the system browser rather than
  // spawning more app windows.
  callWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Messenger's call page arms a beforeunload guard while a call is live, which
  // would otherwise pop a "Leave site?" prompt and block the window from
  // closing (both when the cycle hangs up and when the user clicks X). Ignore
  // it so the window can always close.
  callWindow.webContents.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });
  callWindow.on("closed", () => {
    if (callWindows.get(partition) === callWindow) {
      callWindows.delete(partition);
    }
  });

  // Auto-click "Start call" so the call actually connects instead of parking on
  // the "Ready to call?" screen. Runs on each main-frame load; once in-call the
  // button is gone, so it's a no-op — which also makes the reused-window path
  // (loadURL below) auto-start correctly.
  callWindow.webContents.on("did-finish-load", () => {
    if (callWindow.isDestroyed()) return;
    callWindow.webContents.executeJavaScript(AUTO_START_CALL_SCRIPT, true).catch(() => {});
  });

  callWindows.set(partition, callWindow);
  callWindow.loadURL(callUrl);
}

// Click Messenger's red end-call button so the call ends cleanly on Messenger's
// side (the callee stops ringing) before we tear the popup down.
const HANGUP_SCRIPT = `
  (() => {
    const rx = /end call|leave call|hang ?up|end room/i;
    for (const el of document.querySelectorAll('div[role="button"], button, [aria-label]')) {
      const label = (el.getAttribute('aria-label') || '').trim();
      if (label && rx.test(label)) { el.click(); return true; }
    }
    return false;
  })()
`;

// Close and forget the in-app call window for a service, if one is open. Used
// to hang up an unanswered ring, and on cycle-stop / view teardown.
export function closeCallWindow(serviceId: string) {
  const partition = `persist:service-${serviceId}`;
  const win = callWindows.get(partition);
  callWindows.delete(partition); // forget now so it can't be reused mid-close
  if (!win || win.isDestroyed()) return;
  // Hang up in-page first so the call ends cleanly (callee stops ringing), then
  // force the window shut. destroy() bypasses the beforeunload guard that
  // blocks window.close() while a call is live, so the popup always closes.
  win.webContents
    .executeJavaScript(HANGUP_SCRIPT, true)
    .catch(() => {})
    .finally(() => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy();
      }, 400);
    });
}

// One round-trip into the call popup per poll: (1) draw/update a countdown pill
// showing how many seconds until an unanswered call is hung up and the cycle
// restarts, and (2) return the call-duration timer if the page shows one. A
// connected Messenger call shows a timer counting up; the outgoing "ringing"
// screen doesn't — seeing that timer advance is what tells "answered" from
// "still ringing". (The pill's own text isn't a m:ss timer, so it can't
// false-positive the scan.)
function buildCallOverlayScript(remainingSec: number): string {
  return `
    (() => {
      let el = document.getElementById('__largs_ring_countdown__');
      if (!el) {
        el = document.createElement('div');
        el.id = '__largs_ring_countdown__';
        el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(24,24,37,0.92);color:#fff;font:600 13px system-ui,-apple-system,sans-serif;padding:6px 14px;border-radius:999px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.45);';
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = 'Ending call in ${remainingSec}s';
      for (const node of document.querySelectorAll('span, div')) {
        if (node.children.length) continue;
        const t = (node.textContent || '').trim();
        if (/^\\d{1,2}:\\d{2}(:\\d{2})?$/.test(t)) return t;
      }
      return null;
    })()
  `;
}

const REMOVE_CALL_OVERLAY_SCRIPT = `
  (() => {
    const el = document.getElementById('__largs_ring_countdown__');
    if (el) el.remove();
  })()
`;

// Watch a freshly-started call for an answer while showing a countdown to
// hang-up on the popup. Resolves true once the call connects (a running
// duration timer is observed to advance), or false if timeoutMs elapses first
// — in which case the popup is closed, hanging up the unanswered outgoing call.
// Best-effort: detection keys on Messenger's call timer, so a UI overhaul there
// could require updating buildCallOverlayScript.
export function monitorCallForAnswer(serviceId: string, timeoutMs: number): Promise<boolean> {
  const partition = `persist:service-${serviceId}`;
  const POLL_MS = 1000;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let lastTimer: string | null = null;
    const tick = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) {
        closeCallWindow(serviceId); // no answer in the window — hang up
        resolve(false);
        return;
      }
      const win = callWindows.get(partition);
      if (win && !win.isDestroyed()) {
        try {
          const timer: string | null = await win.webContents.executeJavaScript(
            CALL_TIMER_SCRIPT,
            true,
          );
          // Two different non-null reads = a timer that's counting = connected.
          if (timer && lastTimer && timer !== lastTimer) {
            resolve(true);
            return;
          }
          lastTimer = timer;
        } catch {
          // window navigating/closing — ignore this tick
        }
      } else if (elapsed > 8_000) {
        // Popup never opened (or was closed) well after the click — treat as
        // no-answer so the cycle can try again.
        resolve(false);
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

// Session-level listeners must only be registered once per partition.
function createServiceView(service: Service): WebContentsView {
  const partition = `persist:service-${service.id}`;

  // Hostname (no "www.") used to detect call-capable services (Messenger etc.).
  let callServiceHost = "";
  try {
    callServiceHost = new URL(service.url).hostname.replace(/^www\./, "");
  } catch {
    // invalid URL — leave empty so no adapter matches
  }

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

  // Messenger/Facebook calls: Meta's web client opens an about:blank popup and
  // then points it at its own /groupcall/ page — but its opener keeps resetting
  // that popup back to about:blank, so the call never renders inside that popup.
  // This is a well-known limitation of Electron web-app wrappers. Rather than
  // leave a broken blank window, we grab the real call URL as soon as the popup
  // navigates to it and reopen it in a fresh in-app call window (no opener link,
  // so Meta can't reset it) where WebRTC works fully (issue #59).
  // setWindowOpenHandler (below) allows the hidden popup so this navigation can
  // be observed.
  if (messengerAdapter.matches(callServiceHost)) {
    view.webContents.on("did-create-window", (childWindow) => {
      childWindow.hide(); // keep it hidden until we know what it is
      let settled = false;
      const onNavigate = (event: Electron.Event, navUrl: string) => {
        if (settled || !/^https?:/i.test(navUrl)) return; // ignore the about:blank spin
        settled = true;
        if (/\/(group)?call/i.test(navUrl)) {
          // A call: reopen it in a dedicated in-app window, where WebRTC works
          // and Meta's opener can't blank it out.
          event.preventDefault();
          openCallWindow(navUrl, partition, spoofedUA);
          if (!childWindow.isDestroyed()) childWindow.close();
        } else {
          // Some other genuine popup (e.g. an auth window) — let it show.
          if (!childWindow.isDestroyed()) childWindow.show();
        }
      };
      childWindow.webContents.on("will-navigate", onNavigate);
      childWindow.webContents.on("will-redirect", onNavigate);
      // If the popup only ever spins on about:blank, don't leak the hidden window.
      const leakGuard = setTimeout(() => {
        if (!settled && !childWindow.isDestroyed()) childWindow.close();
      }, 15_000);
      childWindow.on("closed", () => clearTimeout(leakGuard));
    });
  }

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

  // External-link policy shared by the popup handler and the will-navigate
  // guard below. A URL "stays in view" only if it's the service's own domain or
  // an allowlisted auth provider; everything else is treated as an external
  // link and opened in the in-app preview popup.
  const inViewAllowedDomains = [
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
  const keepInView = (targetUrl: string): boolean => {
    try {
      const host = new URL(targetUrl).hostname.replace(/^www\./, "");
      const isServiceDomain =
        !!serviceHost && (host.endsWith(serviceHost) || serviceHost.endsWith(host));
      const isAllowed = inViewAllowedDomains.some((d) => host === d || host.endsWith("." + d));
      return isServiceDomain || isAllowed;
    } catch {
      return false;
    }
  };

  // Popups: keep same-domain/auth popups in the view. External http(s) links are
  // ignored on click — they neither redirect the service nor open the system
  // browser. To open one, users right-click it and choose "View Link" (which
  // opens the preview popup directly).
  view.webContents.setWindowOpenHandler(({ url, disposition }) => {
    // Messenger/Facebook launch a call with window.open("about:blank", …) and
    // then point the popup at their /groupcall/ page. We can't recognise it by
    // the popup URL (it's about:blank), so we key on the new-window disposition
    // plus a call-capable service, and allow the (hidden) popup so the
    // did-create-window handler above can read the real call URL and reopen it
    // in the in-app call window (issue #59).
    if (disposition === "new-window" && messengerAdapter.matches(serviceHost)) {
      return { action: "allow", overrideBrowserWindowOptions: { show: false } };
    }
    if (/^https?:/i.test(url)) {
      // Same-domain / auth links navigate in place; external http(s) links are
      // ignored so users open them via the "View Link" context menu instead.
      if (keepInView(url)) view.webContents.loadURL(url);
      return { action: "deny" };
    }
    // Non-http schemes (mailto:, tel:, …) still hand off to the OS.
    shell.openExternal(url);
    return { action: "deny" };
  });

  // A plain in-page link click to an external site would navigate the whole
  // service view away and blank the service. Cancel it so the service stays put;
  // the link can still be opened via the "View Link" context menu.
  view.webContents.on("will-navigate", (event, url) => {
    if (/^https?:/i.test(url) && !keepInView(url)) {
      event.preventDefault();
    }
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
  // Close any in-app call window tied to this service's partition.
  const callWindow = callWindows.get(`persist:service-${serviceId}`);
  if (callWindow && !callWindow.isDestroyed()) callWindow.close();
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
