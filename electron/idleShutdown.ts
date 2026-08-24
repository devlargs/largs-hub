import { app, WebContents } from "electron";

// Idle auto-close: if the app sees no user interaction for a while, quit it.
//
// "Interaction" means raw input (mouse, keyboard, wheel, touch) delivered to any
// of the app's web contents — the React UI layer, service views, the link
// preview and call popups — plus main-window events that only happen when the
// user acts on the window itself (focus, move, resize). Routine background work
// (notification polling, hibernation sweeps) deliberately does NOT count, so an
// unattended app still closes.
//
// What *does* block the quit is unfinished work the user set going: audio
// playing in a view, a running Pomodoro timer, or scheduled/looping automation.
// Quitting on top of those turned an idle timeout into data loss — a "send at
// 21:00" task armed in the morning could never survive to fire (issue #73).
// The timeout is a setting now, and off by default: an app that closes itself
// unannounced is surprising, so it has to be asked for.

// Coarse polling: the timeout is measured in minutes, so minute-level precision
// is plenty and costs one cheap timer wake-up per minute.
const IDLE_CHECK_MS = 60_000;

export interface IdleShutdownDeps {
  /** Minutes of inactivity before quitting; 0 or less disables the feature. */
  getIdleMinutes(): number;
  /** True while any view is playing audio (a call, a video). */
  isAnythingAudible(): boolean;
  /** True while a Pomodoro focus/break timer is running. */
  hasRunningTimer(): boolean;
  /** True while any service has scheduled or running automation. */
  hasPendingAutomation(): boolean;
}

let deps: IdleShutdownDeps | null = null;
let lastActivityAt = Date.now();
let idleTimer: ReturnType<typeof setInterval> | null = null;

export function initIdleShutdown(d: IdleShutdownDeps) {
  deps = d;
}

export type IdleBlocker = "audio" | "timer" | "automation";

export type IdleDecision =
  { quit: true } | { quit: false; reason: "disabled" | "not-idle-yet" | IdleBlocker };

/**
 * The whole decision, as a pure function so it can be unit-tested: is the app
 * allowed to close itself right now?
 *
 * Blockers are checked last, and only once the idle threshold has actually
 * passed — the point is to spare unfinished work, not to re-time the countdown
 * on every tick.
 */
export function shouldQuitWhenIdle(
  idleMinutes: number,
  idleForMs: number,
  blockers: { audible: boolean; runningTimer: boolean; pendingAutomation: boolean },
): IdleDecision {
  if (!Number.isFinite(idleMinutes) || idleMinutes <= 0) return { quit: false, reason: "disabled" };
  if (idleForMs < idleMinutes * 60_000) return { quit: false, reason: "not-idle-yet" };
  if (blockers.audible) return { quit: false, reason: "audio" };
  if (blockers.runningTimer) return { quit: false, reason: "timer" };
  if (blockers.pendingAutomation) return { quit: false, reason: "automation" };
  return { quit: true };
}

/**
 * Why the app is not quitting right now, or null if nothing is holding it.
 * Exported for the settings UI, which explains the exemptions.
 */
export function idleBlockReason(): IdleBlocker | null {
  if (!deps) return null;
  if (deps.isAnythingAudible()) return "audio";
  if (deps.hasRunningTimer()) return "timer";
  if (deps.hasPendingAutomation()) return "automation";
  return null;
}
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
    const decision = shouldQuitWhenIdle(deps?.getIdleMinutes() ?? 0, Date.now() - lastActivityAt, {
      audible: deps?.isAnythingAudible() ?? false,
      runningTimer: deps?.hasRunningTimer() ?? false,
      pendingAutomation: deps?.hasPendingAutomation() ?? false,
    });
    if (!decision.quit) {
      // Unfinished work counts as activity, so the countdown restarts once it
      // finishes rather than quitting the instant a call ends.
      if (decision.reason !== "disabled" && decision.reason !== "not-idle-yet") noteActivity();
      return;
    }
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
