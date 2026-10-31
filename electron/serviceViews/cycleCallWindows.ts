import { BrowserWindow } from "electron";
import { viewState } from "./state";

// Where a Call Cycle's Messenger popup (callWindow.ts) sits on screen, and
// what the workspace lock does to it. A cycle call normally rings minimized;
// behind the lock it rings hidden instead, so it isn't in the taskbar (or the
// Dock's window list) for anyone to restore past the lock screen. An answered
// call normally comes to the front; behind the lock it waits for the unlock.
// The cycle itself keeps placing and watching calls either way.

// Cycle popups still ringing, and answered ones held back by the lock.
const ringing = new Set<BrowserWindow>();
const awaitingUnlock = new Set<BrowserWindow>();

function track(win: BrowserWindow, set: Set<BrowserWindow>) {
  if (set.has(win)) return;
  set.add(win);
  win.once("closed", () => set.delete(win));
}

/** Put a cycle popup out of the way: minimized, or hidden while locked. */
export function tuckCycleWindow(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  // Minimized and hidden windows are throttled like hidden pages; the call
  // page's auto-start and the answer watch shouldn't slow down behind the lock.
  win.webContents.setBackgroundThrottling(false);
  track(win, ringing);
  if (viewState.viewsSuppressed) {
    if (win.isVisible()) win.hide();
    return;
  }
  if (!win.isVisible()) {
    // Never steal focus, go straight to minimized
    win.showInactive();
    win.minimize();
  } else if (!win.isMinimized()) {
    win.minimize();
  }
}

/** A manual call took the popup over; it's no longer the cycle's. */
export function releaseCycleWindow(win: BrowserWindow) {
  ringing.delete(win);
  awaitingUnlock.delete(win);
}

/** Someone picked up: bring the call forward, or once the workspace unlocks. */
export function surfaceAnsweredCall(win: BrowserWindow) {
  ringing.delete(win);
  if (win.isDestroyed()) return;
  if (viewState.viewsSuppressed) {
    track(win, awaitingUnlock);
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function setCallWindowsLocked(locked: boolean) {
  if (locked) {
    for (const win of ringing) if (!win.isDestroyed() && win.isVisible()) win.hide();
    return;
  }
  for (const win of ringing) tuckCycleWindow(win);
  const answered = [...awaitingUnlock];
  awaitingUnlock.clear();
  for (const win of answered) surfaceAnsweredCall(win);
}
