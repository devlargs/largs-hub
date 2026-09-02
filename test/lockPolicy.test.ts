import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCK_DELAY_MINUTES,
  INITIAL_LOCK_STATE,
  LockState,
  msUntilLock,
  reduceLock,
  sanitizeLockDelayMinutes,
} from "../electron/lockPolicy";

const NOW = 1_700_000_000_000;
const OPTIONS = { enabled: true, delayMinutes: 10 };
const MINUTE = 60_000;

describe("sanitizeLockDelayMinutes", () => {
  it("keeps the three offered values", () => {
    expect(sanitizeLockDelayMinutes(5)).toBe(5);
    expect(sanitizeLockDelayMinutes(10)).toBe(10);
    expect(sanitizeLockDelayMinutes(30)).toBe(30);
  });

  it("falls back to the default for anything else", () => {
    for (const value of [0, 7, -5, 1440, NaN, Infinity, "10", null, undefined, {}]) {
      expect(sanitizeLockDelayMinutes(value)).toBe(DEFAULT_LOCK_DELAY_MINUTES);
    }
  });
});

describe("reduceLock", () => {
  it("does nothing at all while the toggle is off", () => {
    const armed: LockState = { armedAt: NOW, locked: true };
    expect(reduceLock(armed, "away", NOW, { ...OPTIONS, enabled: false })).toEqual(
      INITIAL_LOCK_STATE,
    );
  });

  it("arms the countdown when the window goes away", () => {
    expect(reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS)).toEqual({
      armedAt: NOW,
      locked: false,
    });
  });

  it("keeps the original arm time when it goes away twice", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    expect(reduceLock(armed, "away", NOW + 5 * MINUTE, OPTIONS).armedAt).toBe(NOW);
  });

  it("cancels silently when the user comes back in time", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    const back = reduceLock(armed, "back", NOW + 9 * MINUTE, OPTIONS);
    expect(back).toEqual({ armedAt: null, locked: false });
  });

  it("locks when the user comes back after the delay", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    const back = reduceLock(armed, "back", NOW + 10 * MINUTE, OPTIONS);
    expect(back).toEqual({ armedAt: null, locked: true });
  });

  it("locks on the timer firing, without waiting to be restored", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    expect(reduceLock(armed, "elapsed", NOW + 10 * MINUTE, OPTIONS).locked).toBe(true);
  });

  it("ignores a timer that fires early", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    expect(reduceLock(armed, "elapsed", NOW + MINUTE, OPTIONS)).toEqual(armed);
  });

  it("locks a machine that slept through the countdown", () => {
    // The timer never fires while suspended, so "back" has to check the clock.
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    expect(reduceLock(armed, "back", NOW + 8 * 60 * MINUTE, OPTIONS).locked).toBe(true);
  });

  it("stays locked while the window is bounced around", () => {
    const locked: LockState = { armedAt: null, locked: true };
    expect(reduceLock(locked, "away", NOW, OPTIONS)).toEqual(locked);
    expect(reduceLock(locked, "back", NOW + MINUTE, OPTIONS)).toEqual(locked);
  });

  it("honours the delay it is given", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, { ...OPTIONS, delayMinutes: 5 });
    expect(
      reduceLock(armed, "back", NOW + 6 * MINUTE, { ...OPTIONS, delayMinutes: 5 }).locked,
    ).toBe(true);
    expect(
      reduceLock(armed, "back", NOW + 6 * MINUTE, { ...OPTIONS, delayMinutes: 30 }).locked,
    ).toBe(false);
  });
});

describe("msUntilLock", () => {
  it("is null when nothing is counting down", () => {
    expect(msUntilLock(INITIAL_LOCK_STATE, NOW, OPTIONS)).toBeNull();
    expect(msUntilLock({ armedAt: null, locked: true }, NOW, OPTIONS)).toBeNull();
    expect(msUntilLock({ armedAt: NOW, locked: false }, NOW, { ...OPTIONS, enabled: false })).toBe(
      null,
    );
  });

  it("counts down the remainder of the delay", () => {
    expect(msUntilLock({ armedAt: NOW, locked: false }, NOW + 4 * MINUTE, OPTIONS)).toBe(
      6 * MINUTE,
    );
  });

  it("never goes negative", () => {
    expect(msUntilLock({ armedAt: NOW, locked: false }, NOW + 99 * MINUTE, OPTIONS)).toBe(0);
  });
});
