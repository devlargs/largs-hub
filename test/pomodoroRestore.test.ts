import { describe, expect, it } from "vitest";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  restoreTimer,
  sanitizeLengths,
  sanitizeMinutes,
} from "../electron/pomodoroRestore";
import type { PomodoroTimerState } from "../electron/shared/types";

const MIN = 60_000;
const NOW = 1_700_000_000_000;
const lengths = { focusMinutes: 25, breakMinutes: 5 };

const timer = (overrides: Partial<PomodoroTimerState> = {}): PomodoroTimerState => ({
  serviceId: "svc",
  taskId: "task",
  phase: "focus",
  running: true,
  endsAt: NOW + 10 * MIN,
  remainingMs: 10 * MIN,
  completedFocus: 0,
  ...overrides,
});

describe("sanitizeMinutes", () => {
  it("accepts a sane value", () => {
    expect(sanitizeMinutes(50, 25)).toBe(50);
  });

  it("rounds a fractional value", () => {
    expect(sanitizeMinutes(24.6, 25)).toBe(25);
  });

  it("falls back for out-of-range, non-finite and non-numeric input", () => {
    expect(sanitizeMinutes(0, 25)).toBe(25);
    expect(sanitizeMinutes(-5, 25)).toBe(25);
    expect(sanitizeMinutes(9999, 25)).toBe(25);
    expect(sanitizeMinutes(NaN, 25)).toBe(25);
    expect(sanitizeMinutes("30", 25)).toBe(25);
    expect(sanitizeMinutes(undefined, 25)).toBe(25);
  });
});

describe("sanitizeLengths", () => {
  it("falls back to 25/5", () => {
    expect(sanitizeLengths(undefined, undefined)).toEqual({
      focusMinutes: DEFAULT_FOCUS_MINUTES,
      breakMinutes: DEFAULT_BREAK_MINUTES,
    });
  });

  it("keeps valid values", () => {
    expect(sanitizeLengths(50, 10)).toEqual({ focusMinutes: 50, breakMinutes: 10 });
  });
});

describe("restoreTimer", () => {
  it("restores nothing when there was no stored timer", () => {
    expect(restoreTimer(null, lengths, NOW)).toEqual({
      state: null,
      bankedFocusSessions: 0,
      elapsedWhileClosed: false,
    });
    expect(restoreTimer(undefined, lengths, NOW).state).toBeNull();
  });

  it("rejects a stored value that isn't a usable timer", () => {
    expect(restoreTimer({ serviceId: "" } as PomodoroTimerState, lengths, NOW).state).toBeNull();
  });

  it("leaves a paused timer's remaining time untouched", () => {
    const stored = timer({ running: false, remainingMs: 7 * MIN, endsAt: NOW - 99 * MIN });
    const result = restoreTimer(stored, lengths, NOW);
    expect(result.state).toMatchObject({ running: false, remainingMs: 7 * MIN, phase: "focus" });
    expect(result.bankedFocusSessions).toBe(0);
    expect(result.elapsedWhileClosed).toBe(false);
  });

  it("clamps a paused remainder if the configured phase got shorter", () => {
    const stored = timer({ running: false, remainingMs: 40 * MIN });
    const result = restoreTimer(stored, { focusMinutes: 15, breakMinutes: 5 }, NOW);
    expect(result.state?.remainingMs).toBe(15 * MIN);
  });

  it("keeps a running timer that hasn't run out", () => {
    const result = restoreTimer(timer(), lengths, NOW);
    expect(result.state).toMatchObject({ phase: "focus", completedFocus: 0 });
    expect(result.bankedFocusSessions).toBe(0);
    expect(result.elapsedWhileClosed).toBe(false);
  });

  it("pauses on restore rather than silently resuming a stale cycle", () => {
    expect(restoreTimer(timer(), lengths, NOW).state?.running).toBe(false);
  });

  it("banks one focus session when a focus phase ended while closed", () => {
    // Focus ended a minute ago; the break it rolled into is still running.
    const stored = timer({ endsAt: NOW - 1 * MIN });
    const result = restoreTimer(stored, lengths, NOW);
    expect(result.bankedFocusSessions).toBe(1);
    expect(result.state).toMatchObject({ phase: "break", completedFocus: 1 });
    expect(result.state?.remainingMs).toBe(4 * MIN);
    expect(result.elapsedWhileClosed).toBe(true);
  });

  it("rolls forward through several phases over a long absence", () => {
    // Ends 65 minutes ago: focus done, then break(5)+focus(25)+break(5)+focus(25)
    const stored = timer({ endsAt: NOW - 65 * MIN });
    const result = restoreTimer(stored, lengths, NOW);
    expect(result.bankedFocusSessions).toBe(3);
    expect(result.state?.completedFocus).toBe(3);
    expect(result.elapsedWhileClosed).toBe(true);
  });

  it("does not bank sessions for a timer with no task bound", () => {
    const stored = timer({ taskId: null, endsAt: NOW - 1 * MIN });
    const result = restoreTimer(stored, lengths, NOW);
    expect(result.bankedFocusSessions).toBe(0);
    // The cycle still advances; only the per-task credit is skipped.
    expect(result.state).toMatchObject({ phase: "break", completedFocus: 1 });
  });

  it("banks nothing extra for break phases that elapsed", () => {
    const stored = timer({ phase: "break", endsAt: NOW - 1 * MIN });
    const result = restoreTimer(stored, lengths, NOW);
    expect(result.bankedFocusSessions).toBe(0);
    expect(result.state?.phase).toBe("focus");
  });

  it("always lands on a positive remaining time", () => {
    for (const minutesAgo of [1, 7, 26, 31, 200, 5000]) {
      const result = restoreTimer(timer({ endsAt: NOW - minutesAgo * MIN }), lengths, NOW);
      expect(result.state!.remainingMs).toBeGreaterThan(0);
      expect(result.state!.remainingMs).toBeLessThanOrEqual(25 * MIN);
    }
  });

  it("counts an absurdly long absence exactly, without iterating per phase", () => {
    // 100 whole 30-minute cycles after the stored focus phase ended, landing
    // exactly on a phase boundary: 1 for the phase that was running + 100.
    const hundredCycles = 100 * 30 * MIN;
    const result = restoreTimer(timer({ endsAt: NOW - hundredCycles }), lengths, NOW);
    expect(result.bankedFocusSessions).toBe(101);
    expect(result.state?.completedFocus).toBe(101);
    expect(result.state?.phase).toBe("break");
    expect(result.state?.remainingMs).toBe(5 * MIN);
  });

  it("agrees with a naive phase-by-phase walk", () => {
    // Cross-check the cycle arithmetic against the obvious slow version.
    const walk = (elapsedMin: number) => {
      let phase: "focus" | "break" = "focus";
      let endsAt = NOW - elapsedMin * MIN;
      let banked = 0;
      while (endsAt <= NOW) {
        if (phase === "focus") {
          banked++;
          phase = "break";
        } else {
          phase = "focus";
        }
        endsAt += (phase === "focus" ? 25 : 5) * MIN;
      }
      return { banked, phase, remainingMs: endsAt - NOW };
    };
    for (const elapsedMin of [1, 4, 5, 6, 29, 30, 31, 59, 60, 61, 187, 601]) {
      const naive = walk(elapsedMin);
      const result = restoreTimer(timer({ endsAt: NOW - elapsedMin * MIN }), lengths, NOW);
      expect({
        banked: result.bankedFocusSessions,
        phase: result.state!.phase,
        remainingMs: result.state!.remainingMs,
      }).toEqual(naive);
    }
  });
});
