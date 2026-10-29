import { app, webContents as allWebContents, type WebContents } from "electron";
import { store } from "./store";
import { devToolsAllowed, isDevToolsShortcut } from "./devToolsPolicy";

// Opening and closing DevTools for debug mode (Settings → Developer). Every way
// in — the keyboard shortcut and a service's Inspect Element — asks
// canOpenDevTools() first, and anything already open is closed the moment
// that stops being true (the workspace locks, or debug mode is turned off).

let locked = false;

export function canOpenDevTools(): boolean {
  return devToolsAllowed({ packaged: app.isPackaged, debugMode: store.get("debugMode"), locked });
}

/** Close DevTools everywhere if they're no longer allowed. */
export function refreshDevTools() {
  if (canOpenDevTools()) return;
  for (const wc of allWebContents.getAllWebContents()) {
    if (!wc.isDestroyed() && wc.isDevToolsOpened()) wc.closeDevTools();
  }
}

export function setDevToolsLocked(value: boolean) {
  locked = value;
  refreshDevTools();
}

// Detached: a docked DevTools has nowhere to go in a WebContentsView
function open(wc: WebContents) {
  if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: "detach" });
}

export function inspectElement(wc: WebContents, x: number, y: number) {
  if (!canOpenDevTools() || wc.isDestroyed()) return;
  open(wc);
  wc.inspectElement(x, y);
}

/**
 * Toggle DevTools for `wc` on F12 / Ctrl+Shift+I (Cmd+Option+I on macOS).
 * Call from a before-input-event handler; returns whether it handled the key.
 */
export function handleDevToolsShortcut(
  event: Electron.Event,
  input: Electron.Input,
  wc: WebContents,
): boolean {
  if (!isDevToolsShortcut(input, process.platform) || !canOpenDevTools()) return false;
  event.preventDefault();
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else open(wc);
  return true;
}
