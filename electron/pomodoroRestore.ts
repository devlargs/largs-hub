import type { PomodoroTimerState } from "./shared/types";

// Restoring a Pomodoro timer that was running when the app closed.
//
// The timer used to live only in a module-level variable, so quitting — or the
// idle auto-quit, which needs no interaction at all — threw away a running
// session and never banked its focus count (issue #74). The state is persisted
// now, which means a launch has to work out what happened while the app was
// gone: possibly several phases' worth.
//
// Pure so it can be unit-tested without an Electron runtime.

export interface PomodoroLengths {
  focusMinutes: number;
  breakMinutes: number;
}

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;

/** A stored length is only trusted inside sane bounds. */
export function sanitizeMinutes(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const rounded = Math.round(raw);
  if (rounded < MIN_MINUTES || rounded > MAX_MINUTES) return fallback;
  return rounded;
}

export function sanitizeLengths(focus: unknown, breakLength: unknown): PomodoroLengths {
  return {
    focusMinutes: sanitizeMinutes(focus, DEFAULT_FOCUS_MINUTES),
    breakMinutes: sanitizeMinutes(breakLength, DEFAULT_BREAK_MINUTES),
  };
}

export interface RestoreResult {
  /** The timer to resume with, or null if there is nothing worth restoring. */
  state: PomodoroTimerState | null;
  /**
   * Focus sessions that completed while the app was closed and still need
   * banking against the task. Zero when nothing elapsed.
   */
  bankedFocusSessions: number;
  /**
   * True when phases ran out while the app was closed, so the UI can say so
   * rather than silently presenting a timer that jumped.
   */
  elapsedWhileClosed: boolean;
}

/**
 * Work out what a stored timer should look like now.
 *
 * A paused timer is restored untouched — its remaining time doesn't burn down
 * while the app is closed. A running timer is rolled forward through however
 * many phases fit in the gap, banking each completed focus session, and comes
 * back *paused*: silently resuming a cycle the user hasn't seen since yesterday
 * would be worse than showing them where it got to.
 */
export function restoreTimer(
  stored: PomodoroTimerState | null | undefined,
  lengths: PomodoroLengths,
  now: number,
): RestoreResult {
  const none: RestoreResult = { state: null, bankedFocusSessions: 0, elapsedWhileClosed: false };
  if (!stored || typeof stored !== "object") return none;
  if (typeof stored.serviceId !== "string" || stored.serviceId.length === 0) return none;

  const phaseMs = (phase: "focus" | "break") =>
    (phase === "focus" ? lengths.focusMinutes : lengths.breakMinutes) * 60_000;

  if (!stored.running) {
    // Paused: nothing elapsed, but clamp the remainder to the current phase in
    // case the configured length shrank while the app was closed.
    const remainingMs = Math.min(Math.max(0, stored.remainingMs), phaseMs(stored.phase));
    return {
      state: { ...stored, running: false, remainingMs, endsAt: now + remainingMs },
      bankedFocusSessions: 0,
      elapsedWhileClosed: false,
    };
  }

  let phase = stored.phase;
  let completedFocus = stored.completedFocus;
  let banked = 0;
  let endsAt = stored.endsAt;

  // Skip whole focus+break cycles arithmetically before stepping. Looping one
  // phase at a time would need ~175,000 iterations for a year-long absence; this
  // way any gap costs the same a two-minute one does.
  const cycleMs = phaseMs("focus") + phaseMs("break");
  if (endsAt <= now && cycleMs > 0) {
    const wholeCycles = Math.floor((now - endsAt) / cycleMs);
    if (wholeCycles > 0) {
      endsAt += wholeCycles * cycleMs;
      // Each full cycle contains exactly one focus phase, whichever phase we
      // started in — the alternation is unchanged by a whole number of cycles.
      completedFocus += wholeCycles;
      if (stored.taskId) banked += wholeCycles;
    }
  }

  // At most one cycle is left, so this runs a couple of times at the outside.
  while (endsAt <= now) {
    if (phase === "focus") {
      if (stored.taskId) banked++;
      completedFocus++;
      phase = "break";
    } else {
      phase = "focus";
    }
    endsAt += phaseMs(phase);
  }

  const elapsedWhileClosed = banked > 0 || phase !== stored.phase || endsAt !== stored.endsAt;
  const remainingMs = Math.max(0, endsAt - now);

  return {
    state: {
      ...stored,
      phase,
      completedFocus,
      // Paused on purpose: the user should decide to pick the cycle back up.
      running: false,
      remainingMs,
      endsAt: now + remainingMs,
    },
    bankedFocusSessions: banked,
    elapsedWhileClosed,
  };
}
