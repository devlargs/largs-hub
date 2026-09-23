// When the workspace locks itself.
//
// Pure state machine so it can be unit tested (CLAUDE.md); the timer, the store
// and the window events live in ipc/security.ts. The rule the issue asks for:
// minimizing arms a countdown, coming back before it elapses cancels it with no
// prompt, and coming back after it elapses lands on the password screen.

export const LOCK_DELAY_OPTIONS = [5, 10, 30] as const;
export const DEFAULT_LOCK_DELAY_MINUTES = 10;

export function sanitizeLockDelayMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LOCK_DELAY_MINUTES;
  const minutes = Math.round(value);
  return (LOCK_DELAY_OPTIONS as readonly number[]).includes(minutes)
    ? minutes
    : DEFAULT_LOCK_DELAY_MINUTES;
}

export interface LockState {
  // Timestamp the countdown started at, or null when the window is on screen
  armedAt: number | null;
  locked: boolean;
}

export const INITIAL_LOCK_STATE: LockState = { armedAt: null, locked: false };

// "away" covers minimize and hide-to-tray; "back" covers restore, show and
// focus. "elapsed" is the timer firing. Checking the clock on "back" as well as
// on "elapsed" is what keeps a slept machine honest — its timer may never fire.
// "session-locked" is the OS lock screen coming up, which skips the countdown.
export type LockEvent = "away" | "back" | "elapsed" | "session-locked";

export interface LockOptions {
  enabled: boolean;
  delayMinutes: number;
}

export function reduceLock(
  state: LockState,
  event: LockEvent,
  now: number,
  options: LockOptions,
): LockState {
  if (!options.enabled) return INITIAL_LOCK_STATE;
  const delayMs = sanitizeLockDelayMinutes(options.delayMinutes) * 60_000;

  switch (event) {
    case "session-locked":
      // Locking the machine is the user saying they have walked away, so there
      // is nothing left to wait for: lock now, whatever the countdown was doing.
      return { armedAt: null, locked: true };
    case "away":
      // Already locked, or already counting down — leave the original arm time
      // alone so a second minimize doesn't restart the clock.
      if (state.locked || state.armedAt !== null) return state;
      return { ...state, armedAt: now };
    case "back":
    case "elapsed": {
      if (state.armedAt === null) return state;
      if (now - state.armedAt >= delayMs) return { armedAt: null, locked: true };
      // Back before the delay: cancel silently, straight into the workspace.
      return event === "back" ? { ...state, armedAt: null } : state;
    }
  }
}

// Milliseconds until the countdown should fire, or null when nothing is armed.
export function msUntilLock(state: LockState, now: number, options: LockOptions): number | null {
  if (!options.enabled || state.locked || state.armedAt === null) return null;
  const delayMs = sanitizeLockDelayMinutes(options.delayMinutes) * 60_000;
  return Math.max(0, state.armedAt + delayMs - now);
}

// --- Wrong-password throttle (issue #111) -------------------------------------
// Every place a password is checked (unlock, turning the lock off, changing
// the password) shares one throttle, kept and enforced in the main process and
// persisted so relaunching the app doesn't reset it. The first few wrong
// guesses are free (typos happen); after that each wrong guess blocks further
// attempts for a doubling wait. A right password clears it.

export const FREE_ATTEMPTS = 5;
export const FIRST_BLOCK_MS = 30_000;
export const MAX_BLOCK_MS = 60 * 60_000;

export interface ThrottleState {
  // Wrong passwords since the last right one
  failures: number;
  // Timestamp until which every attempt is refused unchecked, or null
  blockedUntil: number | null;
}

export const INITIAL_THROTTLE: ThrottleState = { failures: 0, blockedUntil: null };

/** Milliseconds until another attempt is accepted; 0 when one is allowed now. */
export function throttleWaitMs(state: ThrottleState, now: number): number {
  if (state.blockedUntil === null) return 0;
  return Math.max(0, state.blockedUntil - now);
}

/**
 * Record a wrong password. The 5th wrong one blocks for 30 s, each one after
 * that doubles the wait, up to an hour.
 */
export function registerFailure(state: ThrottleState, now: number): ThrottleState {
  const failures = state.failures + 1;
  if (failures < FREE_ATTEMPTS) return { failures, blockedUntil: null };
  const blockMs = Math.min(MAX_BLOCK_MS, FIRST_BLOCK_MS * 2 ** (failures - FREE_ATTEMPTS));
  return { failures, blockedUntil: now + blockMs };
}

/**
 * The stored throttle is user-writable JSON, so anything odd becomes "no
 * failures". A blockedUntil far in the future (clock rolled back, or a hand
 * edit) is capped at the longest real wait, so the app can't be locked out
 * for good.
 */
export function sanitizeThrottle(raw: unknown, now: number): ThrottleState {
  if (typeof raw !== "object" || raw === null) return INITIAL_THROTTLE;
  const r = raw as Record<string, unknown>;
  const failures =
    typeof r.failures === "number" && Number.isInteger(r.failures) && r.failures > 0
      ? r.failures
      : 0;
  const blockedUntil =
    typeof r.blockedUntil === "number" && Number.isFinite(r.blockedUntil)
      ? Math.min(r.blockedUntil, now + MAX_BLOCK_MS)
      : null;
  return { failures, blockedUntil };
}

/** "Too many attempts. Try again in 30 seconds." */
export function throttleMessage(waitMs: number): string {
  const seconds = Math.ceil(waitMs / 1000);
  if (seconds < 60) {
    return `Too many attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
