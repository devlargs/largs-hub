import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));

import { viewState } from "../electron/serviceViews/state";
import {
  setCallWindowsLocked,
  surfaceAnsweredCall,
  tuckCycleWindow,
} from "../electron/serviceViews/cycleCallWindows";

// A stand-in for the call popup's BrowserWindow: just the state these
// functions read and the calls they make.
function fakeWindow() {
  const win = {
    visible: false,
    minimized: false,
    focused: false,
    throttled: true,
    isDestroyed: () => false,
    isVisible: () => win.visible,
    isMinimized: () => win.minimized,
    showInactive: () => (win.visible = true),
    show: () => (win.visible = true),
    hide: () => (win.visible = false),
    minimize: () => (win.minimized = true),
    restore: () => (win.minimized = false),
    focus: () => (win.focused = true),
    once: () => undefined,
    webContents: { setBackgroundThrottling: (on: boolean) => (win.throttled = on) },
  };
  return win;
}
type Win = Parameters<typeof tuckCycleWindow>[0];
const asWin = (w: ReturnType<typeof fakeWindow>) => w as unknown as Win;

beforeEach(() => {
  setCallWindowsLocked(false); // drain anything an earlier test left waiting
  viewState.viewsSuppressed = false;
});

describe("cycle call windows", () => {
  it("rings minimized and unthrottled while unlocked", () => {
    const win = fakeWindow();
    tuckCycleWindow(asWin(win));
    expect(win.visible && win.minimized).toBe(true);
    expect(win.throttled).toBe(false);
  });

  it("rings hidden behind the lock, and comes back minimized on unlock", () => {
    viewState.viewsSuppressed = true;
    const win = fakeWindow();
    tuckCycleWindow(asWin(win));
    expect(win.visible).toBe(false);

    viewState.viewsSuppressed = false;
    setCallWindowsLocked(false);
    expect(win.visible && win.minimized).toBe(true);
    expect(win.focused).toBe(false);
  });

  it("hides a ringing popup when the workspace locks", () => {
    const win = fakeWindow();
    tuckCycleWindow(asWin(win));
    viewState.viewsSuppressed = true;
    setCallWindowsLocked(true);
    expect(win.visible).toBe(false);
  });

  it("brings an answered call forward straight away while unlocked", () => {
    const win = fakeWindow();
    tuckCycleWindow(asWin(win));
    surfaceAnsweredCall(asWin(win));
    expect(win.visible && !win.minimized && win.focused).toBe(true);
  });

  it("holds an answered call back until the workspace unlocks", () => {
    viewState.viewsSuppressed = true;
    const win = fakeWindow();
    tuckCycleWindow(asWin(win));
    surfaceAnsweredCall(asWin(win));
    expect(win.visible).toBe(false);

    viewState.viewsSuppressed = false;
    setCallWindowsLocked(false);
    expect(win.visible && win.focused).toBe(true);
  });
});
