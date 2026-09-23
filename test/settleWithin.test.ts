import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleWithin } from "../electron/settleWithin";

describe("settleWithin", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves true when the promise fulfils in time", async () => {
    await expect(settleWithin(Promise.resolve("ok"), 1000)).resolves.toBe(true);
  });

  it("resolves true, not rejects, when the promise rejects in time", async () => {
    await expect(settleWithin(Promise.reject(new Error("no")), 1000)).resolves.toBe(true);
  });

  it("gives up on a promise that never settles", async () => {
    const result = settleWithin(new Promise(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe(false);
  });

  it("waits the full time for a slow promise", async () => {
    let settled: boolean | undefined;
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    void settleWithin(slow, 1000).then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });
});
