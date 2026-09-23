import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCK_DELAY_MINUTES,
  FIRST_BLOCK_MS,
  FREE_ATTEMPTS,
  INITIAL_LOCK_STATE,
  INITIAL_THROTTLE,
  LockState,
  MAX_BLOCK_MS,
  ThrottleState,
  msUntilLock,
  reduceLock,
  registerFailure,
  sanitizeLockDelayMinutes,
  sanitizeThrottle,
  throttleMessage,
  throttleWaitMs,
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

  it("locks straight away when the machine's own lock screen comes up", () => {
    expect(reduceLock(INITIAL_LOCK_STATE, "session-locked", NOW, OPTIONS)).toEqual({
      armedAt: null,
      locked: true,
    });
  });

  it("drops a pending countdown when the machine locks", () => {
    const armed = reduceLock(INITIAL_LOCK_STATE, "away", NOW, OPTIONS);
    expect(reduceLock(armed, "session-locked", NOW + MINUTE, OPTIONS)).toEqual({
      armedAt: null,
      locked: true,
    });
  });

  it("ignores the machine locking while the toggle is off", () => {
    expect(
      reduceLock(INITIAL_LOCK_STATE, "session-locked", NOW, { ...OPTIONS, enabled: false }),
    ).toEqual(INITIAL_LOCK_STATE);
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

describe("wrong-password throttle", () => {
  const fail = (times: number, start: ThrottleState = INITIAL_THROTTLE, at = NOW) => {
    let state = start;
    for (let i = 0; i < times; i++) state = registerFailure(state, at);
    return state;
  };

  it("lets the first few wrong passwords through with no wait", () => {
    const state = fail(FREE_ATTEMPTS - 1);
    expect(state.failures).toBe(FREE_ATTEMPTS - 1);
    expect(throttleWaitMs(state, NOW)).toBe(0);
  });

  it("blocks for 30 seconds on the fifth wrong password", () => {
    expect(FREE_ATTEMPTS).toBe(5);
    const state = fail(5);
    expect(throttleWaitMs(state, NOW)).toBe(FIRST_BLOCK_MS);
    expect(FIRST_BLOCK_MS).toBe(30_000);
  });

  it("doubles the wait with every wrong password after that", () => {
    expect(throttleWaitMs(fail(6), NOW)).toBe(60_000);
    expect(throttleWaitMs(fail(7), NOW)).toBe(120_000);
    expect(throttleWaitMs(fail(8), NOW)).toBe(240_000);
  });

  it("never waits longer than an hour", () => {
    expect(throttleWaitMs(fail(40), NOW)).toBe(MAX_BLOCK_MS);
    expect(MAX_BLOCK_MS).toBe(60 * 60_000);
  });

  it("counts down, and lets an attempt through once the wait is over", () => {
    const state = fail(5);
    expect(throttleWaitMs(state, NOW + 10_000)).toBe(20_000);
    expect(throttleWaitMs(state, NOW + FIRST_BLOCK_MS)).toBe(0);
    expect(throttleWaitMs(state, NOW + FIRST_BLOCK_MS + 1)).toBe(0);
  });

  it("keeps counting failures after a wait has run out", () => {
    // A wrong guess after the 30 s wait doubles it, it doesn't start over.
    const later = NOW + FIRST_BLOCK_MS;
    const state = registerFailure(fail(5), later);
    expect(throttleWaitMs(state, later)).toBe(2 * FIRST_BLOCK_MS);
  });

  describe("sanitizeThrottle", () => {
    it("reads back what it stored", () => {
      const state = fail(6);
      expect(sanitizeThrottle(JSON.parse(JSON.stringify(state)), NOW)).toEqual(state);
    });

    it("treats anything odd as no failures", () => {
      for (const raw of [null, undefined, "x", 3, [], {}]) {
        expect(sanitizeThrottle(raw, NOW)).toEqual(INITIAL_THROTTLE);
      }
      expect(sanitizeThrottle({ failures: -2, blockedUntil: "soon" }, NOW)).toEqual(
        INITIAL_THROTTLE,
      );
    });

    it("caps a wait that runs past the longest real one", () => {
      const state = sanitizeThrottle({ failures: 9, blockedUntil: NOW + 10 * MAX_BLOCK_MS }, NOW);
      expect(throttleWaitMs(state, NOW)).toBe(MAX_BLOCK_MS);
    });
  });

  it("says how long to wait in words", () => {
    expect(throttleMessage(30_000)).toBe("Too many attempts. Try again in 30 seconds.");
    expect(throttleMessage(1_000)).toBe("Too many attempts. Try again in 1 second.");
    expect(throttleMessage(400)).toBe("Too many attempts. Try again in 1 second.");
    expect(throttleMessage(120_000)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(throttleMessage(61_000)).toBe("Too many attempts. Try again in 2 minutes.");
  });
});
