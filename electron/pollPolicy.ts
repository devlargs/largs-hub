// How often a service view's DOM should be scraped for its unread count.
//
// Every view used to poll on a flat 3-second interval for its entire life,
// whatever the app was doing: window minimized, another service in front, laptop
// on battery. Ten services is ~1,200 script injections an hour, most of them
// scraping pages nobody is looking at, and each one wakes the renderer process
// hibernation exists to keep quiet (issue #80).
//
// `page-title-updated` still fires while backgrounded, so the instant path for
// most services is unaffected by backing this off.
//
// Pure so it can be unit-tested without an Electron runtime.

/** The active service in a focused window — what the old flat rate was for. */
export const POLL_ACTIVE_MS = 3_000;
/** A background view, or the active one while the window is unfocused. */
export const POLL_BACKGROUND_MS = 20_000;
/** Minimized, suspended, or on battery: stop entirely and catch up on resume. */
export const POLL_PAUSED = null;

export interface PollConditions {
  /** This is the service currently on screen. */
  isActive: boolean;
  /** The app window has OS focus. */
  windowFocused: boolean;
  /** The window is minimized (or otherwise not visible at all). */
  windowMinimized: boolean;
  /** The machine has suspended since the last check. */
  systemSuspended: boolean;
  /** Running on battery rather than mains. */
  onBattery: boolean;
}

/**
 * The interval to poll at, or null to pause polling entirely.
 *
 * Pausing is safe because the caller does one catch-up poll when the condition
 * lifts — nothing is permanently missed, it just isn't scraped while nobody
 * could see the result.
 */
export function pollIntervalMs(conditions: PollConditions): number | null {
  // Nothing on screen to update, and on battery the cost isn't worth paying.
  if (conditions.systemSuspended || conditions.windowMinimized) return POLL_PAUSED;
  // On battery a background view isn't worth waking the renderer for; the
  // active one still updates so the app doesn't feel frozen.
  if (conditions.onBattery && !(conditions.isActive && conditions.windowFocused)) {
    return POLL_PAUSED;
  }
  if (conditions.isActive && conditions.windowFocused) return POLL_ACTIVE_MS;
  return POLL_BACKGROUND_MS;
}

/** Whether a change in conditions means the running timer must be re-armed. */
export function pollIntervalChanged(previous: number | null, next: number | null): boolean {
  return previous !== next;
}
