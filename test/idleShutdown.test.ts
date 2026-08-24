import { describe, expect, it } from "vitest";
import { IdleDecision, shouldQuitWhenIdle } from "../electron/idleShutdown";

const MIN = 60_000;
const free = { audible: false, runningTimer: false, pendingAutomation: false };

// Narrows the decision union so a test can assert on the reason directly.
const reasonOf = (decision: IdleDecision) => (decision.quit ? null : decision.reason);

describe("shouldQuitWhenIdle", () => {
  it("quits once the idle threshold has passed with nothing running", () => {
    expect(shouldQuitWhenIdle(60, 61 * MIN, free)).toEqual({ quit: true });
  });

  it("quits exactly on the threshold", () => {
    expect(shouldQuitWhenIdle(60, 60 * MIN, free)).toEqual({ quit: true });
  });

  it("is off by default — 0 minutes never quits", () => {
    expect(shouldQuitWhenIdle(0, 999 * MIN, free)).toEqual({ quit: false, reason: "disabled" });
  });

  it("treats a negative or nonsensical setting as off", () => {
    expect(reasonOf(shouldQuitWhenIdle(-5, 999 * MIN, free))).toBe("disabled");
    expect(reasonOf(shouldQuitWhenIdle(NaN, 999 * MIN, free))).toBe("disabled");
    expect(reasonOf(shouldQuitWhenIdle(Infinity, 999 * MIN, free))).toBe("disabled");
  });

  it("waits until the threshold is actually reached", () => {
    expect(shouldQuitWhenIdle(60, 59 * MIN, free)).toEqual({
      quit: false,
      reason: "not-idle-yet",
    });
  });

  // The three exemptions are the point of #73: quitting on top of any of these
  // turned an idle timeout into lost work.
  it("stays open while audio is playing", () => {
    expect(shouldQuitWhenIdle(60, 999 * MIN, { ...free, audible: true })).toEqual({
      quit: false,
      reason: "audio",
    });
  });

  it("stays open while a focus timer is running", () => {
    expect(shouldQuitWhenIdle(60, 999 * MIN, { ...free, runningTimer: true })).toEqual({
      quit: false,
      reason: "timer",
    });
  });

  it("stays open while automation is pending", () => {
    expect(shouldQuitWhenIdle(60, 999 * MIN, { ...free, pendingAutomation: true })).toEqual({
      quit: false,
      reason: "automation",
    });
  });

  it("quits once the work that was blocking it finishes", () => {
    const busy = { audible: true, runningTimer: true, pendingAutomation: true };
    expect(shouldQuitWhenIdle(60, 999 * MIN, busy).quit).toBe(false);
    expect(shouldQuitWhenIdle(60, 999 * MIN, free).quit).toBe(true);
  });

  it("does not consult the blockers before the threshold", () => {
    // Reporting "audio" here would be misleading — nothing is being blocked yet.
    expect(reasonOf(shouldQuitWhenIdle(60, 1 * MIN, { ...free, audible: true }))).toBe(
      "not-idle-yet",
    );
  });

  it("reports disabled ahead of everything else", () => {
    const busy = { audible: true, runningTimer: true, pendingAutomation: true };
    expect(reasonOf(shouldQuitWhenIdle(0, 999 * MIN, busy))).toBe("disabled");
  });
});
