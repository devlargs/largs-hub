import { WebContentsView, powerMonitor } from "electron";
import { Service } from "../store";
import { pollIntervalChanged, pollIntervalMs } from "../pollPolicy";
import { createFetchTrigger } from "../fetchTrigger";
import { findBadgeAdapter, buildPollScript, parseTitleCount } from "../badge-adapters";
import { reportNotificationCount } from "../notificationCounts";
import { viewState } from "./state";

// Notification-count extraction for one service view, and the conditions its
// poll rate follows (pollPolicy.ts, issue #80).

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

/** Window minimize/restore moves the active view between fast and background polling. */
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
export function attachBadgeExtraction(
  view: WebContentsView,
  service: Service,
  serviceHost: string,
) {
  const adapter = findBadgeAdapter(serviceHost);

  // Timestamp of the last successful fetchCount. Title/DOM readings are
  // suppressed while this is fresh; if the fetcher starts failing (logged out,
  // endpoint changed), it goes stale and scraping takes over automatically.
  let lastDirectFetch = 0;
  const DIRECT_FETCH_INTERVAL_MS = 20_000;
  const DIRECT_FETCH_FRESH_MS = DIRECT_FETCH_INTERVAL_MS * 3;
  const directFetchIsFresh = () => Date.now() - lastDirectFetch < DIRECT_FETCH_FRESH_MS;

  // Main-process count source (no DOM involved). Read on a slow timer as a
  // backstop, and on demand whenever the page title changes — Gmail rewrites
  // its title the moment the unread count moves, so that's when the feed has
  // news (fetchTrigger.ts). Its readings skip the decrease debounce: a feed
  // doesn't blip to 0 mid-render the way a scraped page does.
  let fetchDirect: (() => Promise<void>) | null = null;
  if (adapter?.fetchCount) {
    const fetchCount = adapter.fetchCount.bind(adapter);
    fetchDirect = async () => {
      if (view.webContents.isDestroyed()) return;
      const count = await fetchCount(view.webContents.session);
      if (count !== null && !view.webContents.isDestroyed()) {
        lastDirectFetch = Date.now();
        reportNotificationCount(service.id, count, true);
      }
    };
  }
  const directFetchTrigger = fetchDirect ? createFetchTrigger(() => void fetchDirect?.()) : null;

  view.webContents.on("page-title-updated", (_event, title) => {
    directFetchTrigger?.trigger();
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
      isActive: viewState.activeServiceId === service.id,
      windowFocused: viewState.windowFocused,
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

  // The backstop timer, polled less aggressively since it hits the network
  // rather than the local page.
  let directFetchInterval: ReturnType<typeof setInterval> | null = null;
  if (fetchDirect) {
    const run = fetchDirect;
    directFetchInterval = setInterval(() => void run(), DIRECT_FETCH_INTERVAL_MS);
    // Prime once the page loads (login cookies present) instead of waiting a
    // full interval for the first accurate badge.
    view.webContents.once("did-finish-load", () => void run());
  }

  // Clear the polls as soon as the view is torn down instead of waiting for
  // the next tick to notice the destroyed webContents.
  view.webContents.once("destroyed", () => {
    if (pollTimer) clearInterval(pollTimer);
    pollRateListeners.delete(applyPollRate);
    if (directFetchInterval) clearInterval(directFetchInterval);
    directFetchTrigger?.dispose();
  });
}
