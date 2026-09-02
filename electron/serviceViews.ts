import { BrowserWindow, WebContentsView, Menu, powerMonitor } from "electron";
import { shell } from "electron";
import { store, Service, isSafeServiceUrl, isInternalService } from "./store";
import { shouldKeepInView } from "./navigationPolicy";
import { hookDownloadSession, hasActiveDownload } from "./downloads";
import { hasAutomationForService } from "./messengerAutomation";
import { shouldHibernate } from "./hibernationPolicy";
import { pollIntervalChanged, pollIntervalMs } from "./pollPolicy";
import { findBadgeAdapter, buildPollScript, parseTitleCount } from "./badge-adapters";
import { messengerAdapter } from "./badge-adapters/messenger";
import {
  reportNotificationCount,
  clearNotificationCount,
  resetDecreaseDebounce,
} from "./notificationCounts";
import { DEFAULT_ZOOM, nextZoom, sanitizeZoom } from "./zoom";
import { computeAutomationLayout } from "./automationLayout";
import { SIDEBAR_WIDTH, TITLEBAR_HEIGHT, FIND_BAR_HEIGHT } from "./shared/layout";

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
// Conditions the notification poll rate follows (pollPolicy.ts, issue #80).
let windowMinimized = false;
let systemSuspended = false;
// Each live view registers a callback so a change re-arms every poll at once.
const pollRateListeners = new Set<() => void>();

function isOnBattery(): boolean {
  try {
    return powerMonitor.isOnBatteryPower();
  } catch {
    // Not available on every platform/build — assume mains rather than
    // silently pausing everyone's badges.
    return false;
  }
}

/** Re-arm every view's poll after something that changes the right rate. */
export function refreshPollRates() {
  for (const listener of pollRateListeners) listener();
}

/** Window minimize/restore changes whether polling is worth doing at all. */
export function setWindowMinimized(minimized: boolean) {
  if (windowMinimized === minimized) return;
  windowMinimized = minimized;
  refreshPollRates();
}

/** Wire OS suspend/resume and power-source changes to the poll rate. */
export function watchPowerForPolling() {
  try {
    powerMonitor.on("suspend", () => {
      systemSuspended = true;
      refreshPollRates();
    });
    powerMonitor.on("resume", () => {
      systemSuspended = false;
      refreshPollRates();
    });
    powerMonitor.on("on-battery", refreshPollRates);
    powerMonitor.on("on-ac", refreshPollRates);
  } catch {
    // powerMonitor is unavailable before app-ready on some platforms; the
    // focus/active-service triggers still apply.
  }
}

// The find bar can't be drawn over a service view (child-view reordering is
// unreliable on Windows — see the z-order rule in CLAUDE.md), so it takes a
// strip out of the service view's bounds instead, the same way the automation
// panel takes a column.
let findBarOpen = false;

// Ctrl+<key> zoom shortcuts. "Add"/"Subtract" are the numpad keys.
const ZOOM_KEYS: Record<string, "in" | "out" | "reset"> = {
  "=": "in",
  "+": "in",
  Add: "in",
  "-": "out",
  _: "out",
  Subtract: "out",
  "0": "reset",
};

// When the Messenger automation panel is open the layout splits into a
// service pane (left) and the panel (right). The service view is resized to
// the left share so it stays visible instead of being hidden.
//
// The split is computed here and pushed to the renderer (automationLayout.ts),
// so the panel renders exactly the width main reserved for it instead of both
// sides recomputing a formula that can drift.
let automationSplitOpen = false;

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
  pushAutomationWidth();
}

// The panel's width, for the renderer. 0 when the split is closed.
export function getAutomationPanelWidth(): number {
  const mainWindow = deps?.getMainWindow();
  if (!automationSplitOpen || !mainWindow) return 0;
  const [width] = mainWindow.getContentSize();
  return computeAutomationLayout(Math.max(0, width - SIDEBAR_WIDTH)).panelWidth;
}

// Tell the renderer how wide to draw itself. Sent on open/close and on every
// window resize, so the panel and the service pane can never disagree.
export function pushAutomationWidth() {
  deps?.getUiView()?.webContents.send("automation-split-width", getAutomationPanelWidth());
}

// Reserve (or release) the find bar's strip at the top of the service pane.
// Closing also drops the native match highlighting from the page.
export function setFindBarOpen(open: boolean) {
  if (findBarOpen === open) return;
  findBarOpen = open;
  repositionActiveView();
  if (!open && activeServiceId) {
    const view = serviceViews.get(activeServiceId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.stopFindInPage("clearSelection");
      view.webContents.focus();
    }
  }
}

// --- Find in page ------------------------------------------------------------

export function findInService(
  serviceId: string,
  text: string,
  forward: boolean,
  findNext: boolean,
) {
  const view = serviceViews.get(serviceId);
  if (!view || view.webContents.isDestroyed()) return;
  if (!text) {
    view.webContents.stopFindInPage("clearSelection");
    deps
      ?.getUiView()
      ?.webContents.send("find-results", { serviceId, matches: 0, activeMatchOrdinal: 0 });
    return;
  }
  view.webContents.findInPage(text, { forward, findNext });
}

// Ask the UI to show the find bar for a service and hand it keyboard focus.
// React owns whether the bar is open; main only reserves its strip once the
// renderer confirms with set-find-bar-open.
export function openFindBarFor(serviceId: string) {
  const uiView = deps?.getUiView();
  if (!uiView) return;
  uiView.webContents.send("open-find-bar", serviceId);
  uiView.webContents.focus();
}

export function stopFindInService(serviceId: string) {
  const view = serviceViews.get(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.stopFindInPage("clearSelection");
  }
}

// --- Zoom --------------------------------------------------------------------

export function getServiceZoom(serviceId: string): number {
  return sanitizeZoom(store.get("serviceZoom")[serviceId]);
}

// Persist the factor and apply it to the live view. Stored per service so it
// survives hibernation, a reload, and a restart.
export function setServiceZoom(serviceId: string, factor: number) {
  const zoom = sanitizeZoom(factor);
  const all = { ...store.get("serviceZoom") };
  if (zoom === DEFAULT_ZOOM) delete all[serviceId];
  else all[serviceId] = zoom;
  store.set("serviceZoom", all);

  const view = serviceViews.get(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.setZoomFactor(zoom);
  }
  deps?.getUiView()?.webContents.send("service-zoom-changed", { serviceId, factor: zoom });
}

export function stepServiceZoom(serviceId: string, direction: "in" | "out" | "reset") {
  const factor =
    direction === "reset" ? DEFAULT_ZOOM : nextZoom(getServiceZoom(serviceId), direction);
  setServiceZoom(serviceId, factor);
}

function getAutomationInset() {
  const mainWindow = deps?.getMainWindow();
  if (!automationSplitOpen || !mainWindow) return 0;
  const [width] = mainWindow.getContentSize();
  return computeAutomationLayout(Math.max(0, width - SIDEBAR_WIDTH)).panelWidth;
}

function getViewBounds() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: TITLEBAR_HEIGHT, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  const top = TITLEBAR_HEIGHT + (findBarOpen ? FIND_BAR_HEIGHT : 0);
  return {
    x: SIDEBAR_WIDTH,
    y: top,
    width: Math.max(0, width - SIDEBAR_WIDTH - getAutomationInset()),
    height: Math.max(0, height - top),
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
  view.webContents
    .executeJavaScript(
      `
    (function() {
      if (document.getElementById('__largs_blur_overlay__')) return;
      const el = document.createElement('div');
      el.id = '__largs_blur_overlay__';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:2147483647;pointer-events:none;transition:opacity 0.15s ease;';
      document.documentElement.appendChild(el);
    })()
  `,
    )
    .catch(() => {});
}

export function removeBlurFromView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  view.webContents
    .executeJavaScript(
      `
    (function() {
      const el = document.getElementById('__largs_blur_overlay__');
      if (el) el.remove();
    })()
  `,
    )
    .catch(() => {});
}

// Privacy mode: two panels injected over the page, so a glance at the screen
// only reveals the uncovered remainder. The vertical cover comes down from the
// top over a share of the page height; the horizontal one comes in from the
// left over a share of the page width. Each has its own size and opacity in the
// global privacy settings, and a size of 0 turns that cover off. Purely visual —
// the page underneath keeps working (the overlays never take pointer events) —
// and re-applied on every load since a navigation wipes the injected elements.
const PRIVACY_VERTICAL_ID = "__largs_privacy_overlay__";
const PRIVACY_HORIZONTAL_ID = "__largs_privacy_overlay_h__";

export function applyPrivacyToView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  const verticalPercent = clampPercent(store.get("privacyCoverPercent"), 50);
  const verticalOpacity = clampPercent(store.get("privacyOpacity"), 100) / 100;
  const horizontalPercent = clampPercent(store.get("privacyHorizontalPercent"), 0);
  const horizontalOpacity = clampPercent(store.get("privacyHorizontalOpacity"), 100) / 100;
  const base =
    "position:fixed;top:0;left:0;background:#181825;z-index:2147483647;pointer-events:none;";
  const verticalCss =
    verticalPercent > 0
      ? `${base}width:100vw;height:${verticalPercent}vh;opacity:${verticalOpacity};`
      : "";
  const horizontalCss =
    horizontalPercent > 0
      ? `${base}width:${horizontalPercent}vw;height:100vh;opacity:${horizontalOpacity};`
      : "";
  view.webContents
    .executeJavaScript(
      `
    (function() {
      const panels = [
        ['${PRIVACY_VERTICAL_ID}', '${verticalCss}'],
        ['${PRIVACY_HORIZONTAL_ID}', '${horizontalCss}'],
      ];
      for (const [id, css] of panels) {
        const existing = document.getElementById(id);
        if (!css) { if (existing) existing.remove(); continue; }
        if (existing) { existing.style.cssText = css; continue; }
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = css;
        document.documentElement.appendChild(el);
      }
    })()
  `,
    )
    .catch(() => {});
}

function clampPercent(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Re-inject the overlay everywhere it's active, so a settings change takes
// effect immediately instead of on the next navigation.
export function refreshPrivacyOverlays() {
  for (const [serviceId, view] of serviceViews) {
    if (isPrivacyMode(serviceId)) applyPrivacyToView(view);
  }
}

export function removePrivacyFromView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  view.webContents
    .executeJavaScript(
      `
    (function() {
      for (const id of ['${PRIVACY_VERTICAL_ID}', '${PRIVACY_HORIZONTAL_ID}']) {
        const el = document.getElementById(id);
        if (el) el.remove();
      }
    })()
  `,
    )
    .catch(() => {});
}

function isPrivacyMode(serviceId: string): boolean {
  return store.get("services").find((s) => s.id === serviceId)?.privacyMode === true;
}

// When the window regains focus (e.g. Alt+Tab), focus the active service view
// so keyboard input goes to it (e.g. typing in a Messenger chat)
export function handleWindowFocus() {
  windowFocused = true;
  refreshPollRates(); // focus raises the active view's poll rate
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
  refreshPollRates(); // an unfocused window polls slower
}

// Z-order rule (see CLAUDE.md): overlays can't reliably stack above service
// views on Windows, so React modals hide the active view instead.
// While the workspace is locked no service view may be on screen, whatever the
// renderer asks for — the lock screen draws in the UI view, and a service view
// would sit on top of it (issue #102).
let viewsSuppressed = false;

export function setViewsSuppressed(suppressed: boolean) {
  viewsSuppressed = suppressed;
  setActiveViewVisible(!suppressed);
}

export function setActiveViewVisible(visible: boolean) {
  if (!activeServiceId) return;
  const view = serviceViews.get(activeServiceId);
  if (view) view.setVisible(visible && !viewsSuppressed);
}

// One in-app call window per service partition. Reused so a call cycle that
// re-clicks the call button focuses the open call instead of stacking windows.
const callWindows = new Map<string, BrowserWindow>();

// Partitions whose next call popup is being opened by the Call Cycle
// automation, which arms this just before it clicks the call button;
// openCallWindow consumes it and opens the popup muted and minimized (you're
// not actively on a cycle call until it's answered). Manual calls (clicked in
// Messenger by the user) never arm it, so they stay audible and visible.
const automationCallArmed = new Set<string>();

export function armAutomationCall(serviceId: string) {
  const partition = `persist:service-${serviceId}`;
  automationCallArmed.add(partition);
  // Safety net: if the popup never opens, don't leave the flag to affect a
  // later manual call.
  setTimeout(() => automationCallArmed.delete(partition), 10_000);
}

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
  // Consume the Call Cycle flag (if armed). Manual calls never arm it, so
  // isAutomationCall is false and the popup stays audible and visible.
  const isAutomationCall = automationCallArmed.delete(partition);

  const existing = callWindows.get(partition);
  if (existing && !existing.isDestroyed()) {
    if (isAutomationCall) existing.webContents.setAudioMuted(true);
    existing.loadURL(callUrl);
    if (isAutomationCall) {
      // Keep the cycle out of the way — never steal focus, stay minimized.
      if (!existing.isMinimized()) existing.minimize();
    } else {
      existing.show();
      existing.focus();
    }
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
    // Shown explicitly below so cycle calls can go straight to minimized
    // without flashing on screen first.
    show: false,
    ...(mainWindow ? { parent: mainWindow } : {}),
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  callWindow.setMenuBarVisibility(false);
  callWindow.webContents.setUserAgent(spoofedUA);
  if (isAutomationCall) callWindow.webContents.setAudioMuted(true); // silence cycle calls

  // Cycle calls open minimized (and never take focus): the popup only matters
  // once someone picks up, and monitorCallForAnswer restores it on answer.
  // Manual calls open normally.
  callWindow.once("ready-to-show", () => {
    if (callWindow.isDestroyed()) return;
    if (isAutomationCall) {
      callWindow.showInactive();
      callWindow.minimize();
    } else {
      callWindow.show();
    }
  });
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
        const remainingSec = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
        try {
          const timer: string | null = await win.webContents.executeJavaScript(
            buildCallOverlayScript(remainingSec),
            true,
          );
          // Two different non-null reads = a timer that's counting = connected.
          if (timer && lastTimer && timer !== lastTimer) {
            // Answered — drop the countdown pill and keep the call open. The
            // popup opened minimized for the cycle, so surface it now that
            // there's someone on the other end.
            await win.webContents
              .executeJavaScript(REMOVE_CALL_OVERLAY_SCRIPT, true)
              .catch(() => {});
            if (!win.isDestroyed()) {
              if (win.isMinimized()) win.restore();
              win.show();
              win.focus();
            }
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

  // Electron underlines misspellings but only once a dictionary is chosen.
  // macOS uses the OS spellchecker and rejects the call, hence the guard.
  if (process.platform !== "darwin") {
    try {
      view.webContents.session.setSpellCheckerLanguages(["en-US"]);
    } catch {
      // Dictionary unavailable — the page simply goes unchecked.
    }
  }

  // Zoom is per service and persisted, so re-apply it on every load: a
  // navigation resets the view's zoom factor back to 100%.
  view.webContents.on("did-finish-load", () => {
    const zoom = getServiceZoom(service.id);
    if (zoom !== DEFAULT_ZOOM) view.webContents.setZoomFactor(zoom);
  });

  // findInPage results drive the "3/12" counter in the find bar.
  view.webContents.on("found-in-page", (_event, result) => {
    deps?.getUiView()?.webContents.send("find-results", {
      serviceId: service.id,
      matches: result.matches,
      activeMatchOrdinal: result.activeMatchOrdinal,
    });
  });

  // Deny-by-default permission policy. Without a handler Electron grants
  // whatever the page asks for (camera, mic, geolocation, clipboard, ...).
  // Setting the handler is idempotent per session, so calling it again on
  // view recreation is safe.
  const allowedPermissions = new Set<string>([
    "notifications",
    "fullscreen",
    "clipboard-sanitized-write",
  ]);
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

  // A navigation/reload drops the injected overlay, so re-apply it per load
  // (read from the store — the captured `service` goes stale after an edit).
  view.webContents.on("dom-ready", () => {
    if (isPrivacyMode(service.id)) applyPrivacyToView(view);
  });

  // Context menu for service views
  view.webContents.on("context-menu", (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // Spellcheck first: right-clicking a squiggle should open onto the
    // corrections, not scroll past image and link items to reach them.
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuItems.push({
          label: suggestion,
          click: () => view.webContents.replaceMisspelling(suggestion),
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        menuItems.push({ label: "No suggestions", enabled: false });
      }
      menuItems.push(
        {
          label: "Add to dictionary",
          click: () =>
            view.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: "separator" },
      );
    }

    // Cut/Copy/Paste act on the service view explicitly rather than through
    // menu roles, which would target whichever webContents happens to be
    // focused when the popup opens.
    const { editFlags } = params;
    if (params.isEditable) {
      menuItems.push(
        { label: "Cut", enabled: editFlags.canCut, click: () => view.webContents.cut() },
        { label: "Copy", enabled: editFlags.canCopy, click: () => view.webContents.copy() },
        { label: "Paste", enabled: editFlags.canPaste, click: () => view.webContents.paste() },
        {
          label: "Paste as plain text",
          enabled: editFlags.canPaste,
          click: () => view.webContents.pasteAndMatchStyle(),
        },
        { label: "Select all", click: () => view.webContents.selectAll() },
        { type: "separator" },
      );
    } else if (params.selectionText) {
      menuItems.push(
        { label: "Copy", enabled: editFlags.canCopy, click: () => view.webContents.copy() },
        { type: "separator" },
      );
    }

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

    // Page-wide items are always offered, so the menu is never empty and
    // Ctrl+F / zoom stay discoverable without a keyboard shortcut.
    if (menuItems.length > 0 && menuItems[menuItems.length - 1].type !== "separator") {
      menuItems.push({ type: "separator" });
    }
    menuItems.push(
      {
        label: "Find in page",
        accelerator: "Ctrl+F",
        click: () => openFindBarFor(service.id),
      },
      {
        label: "Zoom in",
        accelerator: "Ctrl+=",
        click: () => stepServiceZoom(service.id, "in"),
      },
      {
        label: "Zoom out",
        accelerator: "Ctrl+-",
        click: () => stepServiceZoom(service.id, "out"),
      },
      {
        label: "Reset zoom",
        accelerator: "Ctrl+0",
        enabled: getServiceZoom(service.id) !== DEFAULT_ZOOM,
        click: () => stepServiceZoom(service.id, "reset"),
      },
    );

    const mainWindow = deps?.getMainWindow();
    if (mainWindow) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow });
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

  const runPoll = () => {
    if (!view.webContents || view.webContents.isDestroyed()) return;
    view.webContents
      .executeJavaScript(pollScript, true)
      .then((count: number) => {
        if (directFetchIsFresh()) return;
        reportNotificationCount(service.id, count);
      })
      .catch(() => {});
  };

  // The rate follows what the app is actually doing rather than running flat
  // out for the view's whole life (issue #80). Re-armed whenever the conditions
  // change — service switch, window focus/minimize, suspend/resume, power.
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let currentPollMs: number | null = null;

  const applyPollRate = () => {
    if (view.webContents.isDestroyed()) return;
    const next = pollIntervalMs({
      isActive: activeServiceId === service.id,
      windowFocused,
      windowMinimized,
      systemSuspended,
      onBattery: isOnBattery(),
    });
    if (!pollIntervalChanged(currentPollMs, next)) return;
    // Coming back from paused: catch up immediately so a badge that changed
    // while we weren't looking isn't stale until the next tick.
    const wasPaused = currentPollMs === null;
    currentPollMs = next;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (next === null) return;
    if (wasPaused) runPoll();
    pollTimer = setInterval(runPoll, next);
  };

  applyPollRate();
  pollRateListeners.add(applyPollRate);

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
    if (pollTimer) clearInterval(pollTimer);
    pollRateListeners.delete(applyPollRate);
    if (directFetchInterval) clearInterval(directFetchInterval);
  });

  // Browser shortcuts have to be intercepted here too — a service view with
  // focus never lets these reach the renderer's window keydown handler.
  view.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && findBarOpen) {
      event.preventDefault();
      deps?.getUiView()?.webContents.send("close-find-bar");
      return;
    }
    // Zoom tolerates shift: "+" is shift+"=" on most layouts, so requiring an
    // unshifted key would break the shortcut people actually press.
    if (
      input.type === "keyDown" &&
      input.control &&
      !input.alt &&
      !input.meta &&
      ZOOM_KEYS[input.key] !== undefined
    ) {
      event.preventDefault();
      stepServiceZoom(service.id, ZOOM_KEYS[input.key]);
      return;
    }
    if (input.type === "keyDown" && input.control && !input.shift && !input.alt && !input.meta) {
      if (input.key.toLowerCase() === "f") {
        event.preventDefault();
        openFindBarFor(service.id);
        return;
      }
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
  const keepInView = (targetUrl: string): boolean => shouldKeepInView(targetUrl, serviceHost);

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
    const view = serviceViews.get(serviceId);
    if (!view || view.webContents.isDestroyed()) continue;

    const decision = shouldHibernate(
      {
        serviceId,
        lastActiveAt: serviceLastActive.get(serviceId),
        // Work the user started and expects to keep running in the background,
        // which is exactly when the idle timer fires (issue #76).
        audible: view.webContents.isCurrentlyAudible(),
        hasAutomation: hasAutomationForService(serviceId),
        hasDownload: hasActiveDownload(`persist:service-${serviceId}`),
      },
      activeServiceId,
      cutoff,
    );

    if (decision.hibernate) {
      hibernateServiceView(serviceId);
      continue;
    }
    // A brand new view has no timestamp yet — start its clock now so it gets a
    // full interval rather than being measured from time it didn't exist.
    if (decision.reason === "no-timestamp") serviceLastActive.set(serviceId, Date.now());
    // "busy" deliberately doesn't reset the clock: the moment the work finishes
    // the view is eligible again, instead of earning another full interval.
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
  if (isInternalService(requested)) {
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

  view.setVisible(!viewsSuppressed);
  view.setBounds(getViewBounds());
  if (isPrivacyMode(serviceId)) applyPrivacyToView(view);
  else removePrivacyFromView(view);
  if (windowFocused && !viewsSuppressed) {
    view.webContents.focus();
  } else {
    const service = store.get("services").find((s) => s.id === serviceId);
    if (service?.blurWhenInactive) applyBlurToView(view);
    else removeBlurFromView(view);
  }
  activeServiceId = serviceId;
  refreshPollRates(); // the newly active view polls faster, the old one slower
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
  refreshPollRates(); // nothing is active now, so every view drops to background
}

// Pre-load all saved services so they're warm on startup (if enabled)
export function preloadServices() {
  const mainWindow = deps?.getMainWindow();
  if (!store.get("wakeServicesAutomatically")) return;
  const services = store.get("services");
  for (const service of services) {
    if (isInternalService(service)) continue; // internal — no web view
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

/** Whether any service view is currently playing audio (issue #73). */
export function isAnyServiceAudible(): boolean {
  for (const view of serviceViews.values()) {
    if (!view.webContents.isDestroyed() && view.webContents.isCurrentlyAudible()) return true;
  }
  for (const callWindow of callWindows.values()) {
    if (!callWindow.isDestroyed() && callWindow.webContents.isCurrentlyAudible()) return true;
  }
  return false;
}
