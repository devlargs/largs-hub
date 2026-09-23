import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSaver } from "../electron/debouncedSave";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const stored: Bounds = { x: 0, y: 0, width: 800, height: 600 };

function setup() {
  const write = vi.fn<(value: Bounds) => void>();
  const read = vi.fn(() => stored);
  const saver = createDebouncedSaver<Bounds>({ read, write, delayMs: 500 });
  return { saver, read, write };
}

describe("createDebouncedSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes once, after the delay, with every change merged in", () => {
    const { saver, write } = setup();
    saver.save({ width: 900 });
    saver.save({ height: 700 });
    saver.save({ x: 10, y: 20 });
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ x: 10, y: 20, width: 900, height: 700 });
  });

  it("reads the stored value only to start a batch", () => {
    const { saver, read } = setup();
    saver.save({ width: 900 });
    saver.save({ width: 950 });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not push the write back with each change", () => {
    const { saver, write } = setup();
    saver.save({ width: 900 });
    vi.advanceTimersByTime(400);
    saver.save({ width: 950 });
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledWith({ ...stored, width: 950 });
  });

  it("flush writes what's pending straight away, and only once", () => {
    const { saver, write } = setup();
    saver.save({ x: 5 });
    saver.flush();
    expect(write).toHaveBeenCalledWith({ ...stored, x: 5 });
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending writes nothing", () => {
    const { saver, write } = setup();
    saver.flush();
    expect(write).not.toHaveBeenCalled();
  });
});
