import { beforeEach, describe, expect, it } from "vitest";
import { DECREASE_THRESHOLD, PendingDecrease, shouldAcceptCount } from "../electron/badgeDebounce";

describe("shouldAcceptCount", () => {
  let pending: Map<string, PendingDecrease>;
  beforeEach(() => {
    pending = new Map();
  });

  const report = (previous: number, next: number, id = "s") =>
    shouldAcceptCount(pending, id, previous, next).accept;

  it("accepts an increase immediately — a new message must show at once", () => {
    expect(report(0, 1)).toBe(true);
    expect(report(3, 9)).toBe(true);
  });

  it("ignores an unchanged reading", () => {
    expect(report(4, 4)).toBe(false);
  });

  it("holds the first sighting of a decrease", () => {
    expect(report(5, 0)).toBe(false);
    expect(pending.get("s")).toEqual({ count: 0, streak: 1 });
  });

  it("accepts the decrease once it repeats to the threshold", () => {
    expect(report(5, 0)).toBe(false);
    expect(report(5, 0)).toBe(true);
    expect(pending.has("s")).toBe(false);
  });

  // The blink this whole mechanism exists to stop: a page reports 0 mid-render
  // and is back to its real count on the next poll.
  it("swallows a one-poll blip to zero", () => {
    expect(report(5, 0)).toBe(false); // blip
    expect(report(5, 5)).toBe(false); // recovered — nothing to apply
    expect(pending.has("s")).toBe(false); // and the blip is forgotten
  });

  it("restarts the streak when the lower value moves", () => {
    expect(report(9, 3)).toBe(false);
    expect(report(9, 2)).toBe(false); // different value — starts again
    expect(pending.get("s")).toEqual({ count: 2, streak: 1 });
    expect(report(9, 2)).toBe(true);
  });

  it("clears a pending decrease when a count goes up instead", () => {
    expect(report(5, 0)).toBe(false);
    expect(report(5, 8)).toBe(true);
    expect(pending.has("s")).toBe(false);
  });

  it("debounces each service independently", () => {
    expect(report(5, 0, "a")).toBe(false);
    expect(report(5, 0, "b")).toBe(false);
    expect(report(5, 0, "a")).toBe(true);
    expect(pending.has("b")).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(shouldAcceptCount(pending, "s", 5, 0, 3).accept).toBe(false);
    expect(shouldAcceptCount(pending, "s", 5, 0, 3).accept).toBe(false);
    expect(shouldAcceptCount(pending, "s", 5, 0, 3).accept).toBe(true);
  });

  it("uses a threshold of 2 by default", () => {
    expect(DECREASE_THRESHOLD).toBe(2);
  });

  it("treats a decrease to a non-zero count the same way", () => {
    expect(report(10, 7)).toBe(false);
    expect(report(10, 7)).toBe(true);
  });
});
