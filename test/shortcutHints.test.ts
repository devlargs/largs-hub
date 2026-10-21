import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KeyInput,
  SHORTCUT_HINT_HOLD_MS,
  createShortcutHintTracker,
} from "../electron/shortcutHints";

const ctrlDown: KeyInput = { type: "keyDown", key: "Control", control: true, meta: false };
const ctrlUp: KeyInput = { type: "keyUp", key: "Control", control: false, meta: false };
const withCtrl = (key: string, type = "keyDown"): KeyInput => ({
  type,
  key,
  control: true,
  meta: false,
});

describe("shortcut hint tracker", () => {
  let changes: boolean[];
  let tracker: ReturnType<typeof createShortcutHintTracker>;

  beforeEach(() => {
    vi.useFakeTimers();
    changes = [];
    tracker = createShortcutHintTracker({ onChange: (visible) => changes.push(visible) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the hints once Ctrl has been held for the full delay", () => {
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS - 1);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
  });

  it("hides them when Ctrl is released", () => {
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    tracker.handleInput(ctrlUp);
    expect(changes).toEqual([true, false]);
  });

  it("never shows them for a quick tap", () => {
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(300);
    tracker.handleInput(ctrlUp);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    expect(changes).toEqual([]);
  });

  it("doesn't restart the clock on auto-repeated Ctrl presses", () => {
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS / 2);
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS / 2);
    expect(changes).toEqual([true]);
  });

  it("stays hidden when Ctrl is part of another shortcut", () => {
    tracker.handleInput(ctrlDown);
    tracker.handleInput(withCtrl("c"));
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS * 2);
    expect(changes).toEqual([]);
  });

  it("keeps them up while hopping between services", () => {
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    tracker.handleInput(withCtrl("2"));
    tracker.handleInput(withCtrl("2", "keyUp"));
    tracker.handleInput(withCtrl("3"));
    expect(changes).toEqual([true]);
  });

  it("treats input without the modifier as a missed Ctrl release", () => {
    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    tracker.handleInput({ type: "keyDown", key: "a", control: false, meta: false });
    expect(changes).toEqual([true, false]);
  });

  it("clears everything on reset, including a pending timer", () => {
    tracker.handleInput(ctrlDown);
    tracker.reset();
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    expect(changes).toEqual([]);

    tracker.handleInput(ctrlDown);
    vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    tracker.reset();
    expect(changes).toEqual([true, false]);
  });

  describe("with Cmd as the modifier (macOS)", () => {
    const cmdDown: KeyInput = { type: "keyDown", key: "Meta", control: false, meta: true };
    const cmdUp: KeyInput = { type: "keyUp", key: "Meta", control: false, meta: false };

    beforeEach(() => {
      tracker = createShortcutHintTracker({
        onChange: (visible) => changes.push(visible),
        modifier: "meta",
      });
    });

    it("shows the hints while Cmd is held and hides them on release", () => {
      tracker.handleInput(cmdDown);
      vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
      tracker.handleInput({ type: "keyDown", key: "2", control: false, meta: true });
      tracker.handleInput(cmdUp);
      expect(changes).toEqual([true, false]);
    });

    it("ignores a held Ctrl", () => {
      tracker.handleInput(ctrlDown);
      vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS * 2);
      expect(changes).toEqual([]);
    });
  });
});
