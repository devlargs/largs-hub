import { app, WebContents } from "electron";

// Idle auto-close: if the app sees no user interaction for an hour, quit it.
//
// "Interaction" means raw input (mouse, keyboard, wheel, touch) delivered to any
// of the app's web contents — the React UI layer, service views, the link
// preview and call popups — plus main-window events that only happen when the
// user acts on the window itself (focus, move, resize). Background work
// (notification polling, hibernation sweeps, messenger automation) deliberately
// does NOT count as interaction, so an unattended app still closes.

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
// Coarse polling: the timeout is an hour, so minute-level precision is plenty
// and costs one cheap timer wake-up per minute.
const IDLE_CHECK_MS = 60_000;

let lastActivityAt = Date.now();
let idleTimer: ReturnType<typeof setInterval> | null = null;
// WebContents already wired up, so repeated calls (view recreation reuses an
// id, hibernation rebuilds views) can't stack listeners.
const trackedContents = new WeakSet<WebContents>();

/** Record an interaction — resets the idle countdown. */
export function noteActivity() {
  lastActivityAt = Date.now();
}

/**
 * Count raw input in a web contents as interaction. Safe to call more than once
 * for the same contents.
 */
export function trackInputActivity(webContents: WebContents) {
  if (webContents.isDestroyed() || trackedContents.has(webContents)) return;
  trackedContents.add(webContents);
  // Fires in the main process as input is routed to the renderer — no extra IPC
  // and the handler is a single timestamp write, so it's cheap even for
  // mouse-move streams.
  webContents.on("input-event", noteActivity);
}

export function startIdleShutdown() {
  if (idleTimer) return;
  noteActivity(); // don't count time before the window existed
  idleTimer = setInterval(() => {
    if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS) return;
    stopIdleShutdown();
    app.quit(); // closes windows normally, so window bounds still get flushed
  }, IDLE_CHECK_MS);
}

export function stopIdleShutdown() {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}
