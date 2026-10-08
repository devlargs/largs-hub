import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "../electron/updater/singleFlight";

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("shares the running task instead of starting another", async () => {
    const d = deferred();
    const task = vi.fn(() => d.promise);
    const flight = singleFlight(task);

    const first = flight.run();
    const second = flight.run();
    expect(second).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);
    expect(flight.isRunning()).toBe(true);

    d.resolve();
    await first;
    expect(flight.isRunning()).toBe(false);
  });

  it("allows a fresh run once the last one failed", async () => {
    const d = deferred();
    const task = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValueOnce(undefined);
    const flight = singleFlight(task);

    const first = flight.run();
    d.reject(new Error("network"));
    await expect(first).rejects.toThrow("network");
    expect(flight.isRunning()).toBe(false);

    await flight.run();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
