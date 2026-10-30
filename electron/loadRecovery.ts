// When a service view's page should be loaded again by itself: its main-frame
// load failed, or it never got past loading. Services are woken at launch,
// often before the network is up (or while it's still switching), and a load
// that failed then left the service blank until the user pressed Reload.
// Pure (test/loadRecovery.test.ts); serviceViews/loadRecovery.ts applies it.

// Chromium net error codes that aren't the page failing: the navigation was
// cancelled on purpose (the navigation guard, the user, a newer navigation),
// or a request handler blocked it.
const ERR_ABORTED = -3;
const ERR_BLOCKED_BY_CLIENT = -20;

/** Waits before each automatic retry of a failed load. Then it waits for a click. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

/** A main-frame load that hasn't finished after this long is treated as stuck. */
export const STALLED_LOAD_MS = 20_000;

export function isRetryableLoadFailure(errorCode: number, isMainFrame: boolean): boolean {
  return isMainFrame && errorCode !== ERR_ABORTED && errorCode !== ERR_BLOCKED_BY_CLIENT;
}

/** The wait before retry number `attempt` (0-based), or null once they're used up. */
export function retryDelayMs(attempt: number): number | null {
  return RETRY_DELAYS_MS[attempt] ?? null;
}

export interface LoadHealth {
  // The last main-frame load failed, and nothing has loaded since
  failedUrl: string | null;
  // When the current main-frame load started, null while none is under way
  loadingSince: number | null;
}

/** Whether a view being brought on screen should load its page again. */
export function shouldReloadOnShow(health: LoadHealth, now: number): boolean {
  if (health.failedUrl !== null) return true;
  return health.loadingSince !== null && now - health.loadingSince >= STALLED_LOAD_MS;
}
