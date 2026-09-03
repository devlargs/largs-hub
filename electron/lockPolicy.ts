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
