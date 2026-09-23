import { WebContentsView } from "electron";
import type { AutoStopState, AutomationTask } from "../shared/types";

// Runtime state shared by the messengerAutomation modules: the injected deps,
// the live task list, and the helpers every scheduler path uses to report to
// the panel and reach into the Messenger view.

export interface AutomationDeps {
  getServiceView: (serviceId: string) => WebContentsView | undefined;
  // `enabled` is read by the liveness check: a disabled service ends its tasks.
  getServices: () => Array<{ id: string; url: string; enabled?: boolean }>;
  getUiView: () => WebContentsView | null;
  // Ring an in-app call for up to timeoutMs; resolves true if answered, false
  // on timeout (popup is closed by the callee). Owned by serviceViews.
  monitorCallForAnswer: (serviceId: string, timeoutMs: number) => Promise<boolean>;
  // Hang up / close the in-app call popup for a service, if one is open.
  closeCallWindow: (serviceId: string) => void;
  // Mark the next call popup as automation-placed (cycle calls open muted and
  // minimized; manual calls stay audible and visible). Called just before the
  // call button is clicked.
  armAutomationCall: (serviceId: string) => void;
  // Recent emoji pane. Kept in main's store, injected here so this module
  // stays free of electron-store (and unit-testable without it).
  getRecentEmojis: () => string[];
  recordRecentEmoji: (emoji: string) => string[];
  // Task/auto-stop persistence, injected for the same reason (issue #75).
  loadPersistedTasks: () => unknown;
  savePersistedTasks: (tasks: AutomationTask[]) => void;
  loadPersistedAutoStops: () => unknown;
  savePersistedAutoStops: (autoStops: AutoStopState[]) => void;
  /** Ids of services that still exist, so tasks for removed ones are dropped. */
  getServiceIds: () => string[];
}

let current: AutomationDeps | null = null;

export function setAutomationDeps(deps: AutomationDeps) {
  current = deps;
}

// Every caller runs after registerMessengerAutomation, from an IPC handler or
// a timer it armed, so a missing value is a wiring bug worth failing loudly on.
export function deps(): AutomationDeps {
  if (!current) throw new Error("messengerAutomation used before registerMessengerAutomation");
  return current;
}

export interface InternalTask extends AutomationTask {
  timer: NodeJS.Timeout | null;
  // Call cycle only: poll timer for the "she noticed you" watcher.
  noticeTimer: NodeJS.Timeout | null;
}

export const tasks = new Map<string, InternalTask>();

function toPublic(task: InternalTask): AutomationTask {
  const { timer: _timer, noticeTimer: _noticeTimer, ...publicTask } = task;
  return publicTask;
}

export function publicTasks(): AutomationTask[] {
  return [...tasks.values()].map(toPublic);
}

/** Send to the renderer, if the UI view is still around. */
export function sendToUi(channel: string, payload: unknown) {
  const ui = deps().getUiView();
  if (ui && !ui.webContents.isDestroyed()) {
    ui.webContents.send(channel, payload);
  }
}

// Every task-list change goes to disk as well as to the panel, so a quit at
// any point leaves something restorable (issue #75).
export function pushUpdate() {
  deps().savePersistedTasks(publicTasks());
  sendToUi("messenger-automation-updated", publicTasks());
}

// Returns null when the view is gone — callers stop the task in that case.
export async function inject<T = string>(
  serviceId: string,
  code: string,
): Promise<T | "error" | null> {
  const view = deps().getServiceView(serviceId);
  if (!view || view.webContents.isDestroyed()) return null;
  try {
    return (await view.webContents.executeJavaScript(code, true)) as T;
  } catch {
    return "error";
  }
}
