import { describe, expect, it } from "vitest";
import { devToolsAllowed, isDevToolsShortcut } from "../electron/devToolsPolicy";

describe("devToolsAllowed", () => {
  it("needs debug mode in a packaged build", () => {
    expect(devToolsAllowed({ packaged: true, debugMode: false, locked: false })).toBe(false);
    expect(devToolsAllowed({ packaged: true, debugMode: true, locked: false })).toBe(true);
  });

  it("is always on when running from source", () => {
    expect(devToolsAllowed({ packaged: false, debugMode: false, locked: false })).toBe(true);
  });

  // DevTools on the UI view would reach window.electronAPI past the lock (#111)
  it("is never allowed while the workspace is locked", () => {
    expect(devToolsAllowed({ packaged: true, debugMode: true, locked: true })).toBe(false);
    expect(devToolsAllowed({ packaged: false, debugMode: true, locked: true })).toBe(false);
  });
});

const key = (
  code: string,
  mods: Partial<Record<"control" | "shift" | "alt" | "meta", boolean>> = {},
) => ({
  type: "keyDown",
  code,
  control: false,
  shift: false,
  alt: false,
  meta: false,
  ...mods,
});

describe("isDevToolsShortcut", () => {
  it("takes F12 on every platform", () => {
    expect(isDevToolsShortcut(key("F12"), "win32")).toBe(true);
    expect(isDevToolsShortcut(key("F12"), "darwin")).toBe(true);
  });

  it("takes Ctrl+Shift+I on Windows", () => {
    expect(isDevToolsShortcut(key("KeyI", { control: true, shift: true }), "win32")).toBe(true);
    expect(isDevToolsShortcut(key("KeyI", { meta: true, alt: true }), "win32")).toBe(false);
    expect(isDevToolsShortcut(key("KeyI", { control: true }), "win32")).toBe(false);
  });

  it("takes Cmd+Option+I on macOS", () => {
    expect(isDevToolsShortcut(key("KeyI", { meta: true, alt: true }), "darwin")).toBe(true);
    expect(isDevToolsShortcut(key("KeyI", { control: true, shift: true }), "darwin")).toBe(false);
    expect(isDevToolsShortcut(key("KeyI", { meta: true }), "darwin")).toBe(false);
  });

  it("ignores key releases and other keys", () => {
    expect(isDevToolsShortcut({ ...key("F12"), type: "keyUp" }, "win32")).toBe(false);
    expect(isDevToolsShortcut(key("KeyJ", { control: true, shift: true }), "win32")).toBe(false);
  });
});
