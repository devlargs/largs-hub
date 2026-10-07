import { describe, expect, it } from "vitest";
import { shortcutNumberFor, switchTargetFor } from "../electron/shared/shortcuts";

describe("switchTargetFor", () => {
  it("sends Ctrl+1 Home", () => {
    expect(switchTargetFor("1")).toEqual({ kind: "home" });
  });

  it("maps Ctrl+2-9 to the first eight services", () => {
    expect(switchTargetFor("2")).toEqual({ kind: "service", index: 0 });
    expect(switchTargetFor("9")).toEqual({ kind: "service", index: 7 });
  });

  it("ignores keys that aren't 1-9", () => {
    for (const key of ["0", "10", "a", "", "Control", "1.5"]) {
      expect(switchTargetFor(key)).toBeNull();
    }
  });
});

describe("shortcutNumberFor", () => {
  it("numbers services from 2, after Home", () => {
    expect(shortcutNumberFor(0)).toBe(2);
    expect(shortcutNumberFor(7)).toBe(9);
  });

  it("gives no number past the ninth key", () => {
    expect(shortcutNumberFor(8)).toBeNull();
  });

  it("round-trips with switchTargetFor", () => {
    for (let index = 0; index < 8; index++) {
      expect(switchTargetFor(String(shortcutNumberFor(index)))).toEqual({
        kind: "service",
        index,
      });
    }
  });
});
