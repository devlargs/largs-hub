import { describe, expect, it } from "vitest";
import {
  emojiBurst,
  nextDailyFireAt,
  randomDelayMs,
} from "../electron/messengerAutomation/schedule";

// Local wall-clock times, like the scheduler uses
const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s, 0).getTime();

describe("nextDailyFireAt", () => {
  it("fires later today when the time is still ahead", () => {
    expect(nextDailyFireAt("2130", at(2026, 9, 23, 9, 0))).toBe(at(2026, 9, 23, 21, 30));
  });

  it("rolls over to tomorrow once the time has passed", () => {
    expect(nextDailyFireAt("0800", at(2026, 9, 23, 9, 0))).toBe(at(2026, 9, 24, 8, 0));
  });

  it("treats exactly now as passed", () => {
    expect(nextDailyFireAt("0900", at(2026, 9, 23, 9, 0))).toBe(at(2026, 9, 24, 9, 0));
  });

  it("rolls over the end of a month", () => {
    expect(nextDailyFireAt("0000", at(2026, 9, 30, 23, 59))).toBe(at(2026, 10, 1, 0, 0));
  });
});

describe("randomDelayMs", () => {
  it("spans whole seconds from min to max inclusive", () => {
    expect(randomDelayMs(30, 120, () => 0)).toBe(30_000);
    expect(randomDelayMs(30, 120, () => 0.999999)).toBe(120_000);
    expect(randomDelayMs(5, 5, () => 0.5)).toBe(5_000);
  });
});

describe("emojiBurst", () => {
  it("repeats the emoji between once and max times", () => {
    expect(emojiBurst("🔥", 5, () => 0)).toBe("🔥");
    expect(emojiBurst("🔥", 5, () => 0.999999)).toBe("🔥".repeat(5));
    expect(emojiBurst("❤️", 3, () => 0.5)).toBe("❤️❤️");
  });
});
