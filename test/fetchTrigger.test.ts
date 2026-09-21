import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRIGGER_FETCH_DELAYS_MS, createFetchTrigger } from "../electron/fetchTrigger";

describe("createFetchTrigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches soon after a trigger, then once more to catch a lagging feed", () => {
    const fetch = vi.fn();
    createFetchTrigger(fetch, [1000, 6000]).trigger();
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("collapses a burst of triggers into one set of fetches", () => {
    const fetch = vi.fn();
    const trigger = createFetchTrigger(fetch, [1000, 6000]);
    trigger.trigger();
    vi.advanceTimersByTime(500);
    trigger.trigger();
    vi.advanceTimersByTime(500);
    trigger.trigger();
    vi.advanceTimersByTime(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("runs nothing once disposed", () => {
    const fetch = vi.fn();
    const trigger = createFetchTrigger(fetch);
    trigger.trigger();
    trigger.dispose();
    vi.advanceTimersByTime(60_000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the feed well inside the 20-second backstop interval", () => {
    expect(TRIGGER_FETCH_DELAYS_MS[0]).toBeLessThanOrEqual(2000);
  });
});
