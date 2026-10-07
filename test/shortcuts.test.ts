import { describe, expect, it } from "vitest";
import { resolveSwitch, shortcutNumberFor, switchTargetFor } from "../electron/shared/shortcuts";

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

describe("resolveSwitch", () => {
  const ids = ["gmail", "slack"];

  it("does nothing for Ctrl on its own or any other Ctrl key", () => {
    for (const key of ["Control", "c", "v", "0", "f", "Tab"]) {
      expect(resolveSwitch(key, ids)).toBeNull();
    }
  });

  it("goes Home on Ctrl+1, even with no services", () => {
    expect(resolveSwitch("1", ids)).toEqual({ kind: "home" });
    expect(resolveSwitch("1", [])).toEqual({ kind: "home" });
  });

  it("opens the service at Ctrl+2 onwards", () => {
    expect(resolveSwitch("2", ids)).toEqual({ kind: "service", id: "gmail" });
    expect(resolveSwitch("3", ids)).toEqual({ kind: "service", id: "slack" });
  });

  it("does nothing for a number past the last service", () => {
    expect(resolveSwitch("4", ids)).toBeNull();
  });
});
