import type { WebContents, WebContentsView } from "electron";
import { loadWithIdentityFor } from "../chromeIdentity";
import { isRetryableLoadFailure, retryDelayMs, shouldReloadOnShow } from "../loadRecovery";

// Loads a service's page again when its load failed or got stuck, so a
// service woken at launch before the network was up doesn't stay blank until
// Reload is pressed (loadRecovery.ts decides). A failed load is retried on its
// own a few times, and again whenever the view is brought on screen.

interface Recovery {
  failedUrl: string | null;
  loadingSince: number | null;
  // The URL the current main-frame load is headed for
  loadingUrl: string | null;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const recoveries = new WeakMap<WebContents, Recovery>();

function clearTimer(recovery: Recovery) {
  if (recovery.timer) clearTimeout(recovery.timer);
  recovery.timer = null;
}

// Through loadWithIdentityFor, so a retried sign-in page still presents the
// identity it needs (chromeIdentity.ts).
function retry(contents: WebContents, recovery: Recovery, url: string) {
  clearTimer(recovery);
  if (contents.isDestroyed()) return;
  recovery.failedUrl = null;
  recovery.loadingSince = Date.now();
  void loadWithIdentityFor(contents, url);
}

export function attachLoadRecovery(view: WebContentsView) {
  const contents = view.webContents;
  const recovery: Recovery = {
    failedUrl: null,
    loadingSince: null,
    loadingUrl: null,
    attempts: 0,
    timer: null,
  };
  recoveries.set(contents, recovery);

  contents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    recovery.loadingSince = Date.now();
    recovery.loadingUrl = details.url;
  });

  // Committed a real page (an error page emits did-fail-load instead)
  contents.on("did-navigate", () => {
    recovery.failedUrl = null;
    recovery.attempts = 0;
    clearTimer(recovery);
  });

  contents.on("dom-ready", () => {
    recovery.loadingSince = null;
  });

  contents.on("did-fail-load", (_event, errorCode, _description, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return;
    recovery.loadingSince = null;
    if (!isRetryableLoadFailure(errorCode, isMainFrame) || !validatedUrl) return;
    console.warn(`[loadRecovery] ${validatedUrl} failed to load (${errorCode})`);
    recovery.failedUrl = validatedUrl;
    clearTimer(recovery);
    const delay = retryDelayMs(recovery.attempts);
    if (delay === null) return; // out of retries: showing the view tries again
    recovery.attempts++;
    recovery.timer = setTimeout(() => retry(contents, recovery, validatedUrl), delay);
  });

  contents.once("destroyed", () => clearTimer(recovery));
}

/** Load the view's page again if it failed or is stuck. Call as it comes on screen. */
export function reloadIfBroken(view: WebContentsView) {
  const contents = view.webContents;
  const recovery = recoveries.get(contents);
  if (!recovery || contents.isDestroyed()) return;
  if (!shouldReloadOnShow(recovery, Date.now())) return;
  const url = recovery.failedUrl ?? recovery.loadingUrl;
  if (!url) return;
  recovery.attempts = 0; // a fresh round of automatic retries if this fails too
  retry(contents, recovery, url);
}
