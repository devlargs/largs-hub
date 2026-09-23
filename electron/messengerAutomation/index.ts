import { ipcMain, powerMonitor } from "electron";
import type {
  AutoStopResult,
  AutoStopState,
  AutomationTask,
  StartResult,
  TaskSpec,
} from "../shared/types";
import {
  AutomationDeps,
  inject,
  publicTasks,
  pushUpdate,
  setAutomationDeps,
  tasks,
} from "./runtime";
import { validateAutoStopMinutes, validateSpec } from "./validation";
import { buildTypeAndSendScript } from "./scripts";
import { armAutoStop, clearAutoStop, publicAutoStop, restorePersistedAutoStops } from "./autoStop";
import {
  launchTask,
  restorePersistedTasks,
  stopAllForService,
  stopTask,
  sweepOverdue,
} from "./tasks";

// Messenger automation: scheduling/looping lives in the main process so tasks
// survive page reloads and keep running while the view is hidden or another
// service is active. Only the final "type + click send" script is injected
// into the Messenger WebContentsView at fire time.
//
//   index.ts       IPC handlers and the public API main/serviceViews use
//   runtime.ts     injected deps, the live task list, push/inject helpers
//   tasks.ts       the scheduler: arm, loop, call cycle, stop, restore
//   autoStop.ts    per-service auto-stop countdowns
//   notice.ts      "she noticed you" detection for the call cycle (pure)
//   validation.ts  task-spec and auto-stop validation (pure)
//   scripts.ts     injected page scripts (pure, snapshot-tested)

export type { TaskSpec, AutomationTask, StartResult, AutoStopState, AutoStopResult };
export type { AutomationDeps } from "./runtime";
export type { NoticeSignals } from "./notice";
export { detectNotice, isNoticeSignals } from "./notice";
export { validateSpec, validateAutoStopMinutes } from "./validation";

// How often the wall clock is re-checked for timers that drifted (OS sleep
// skews a long setTimeout).
const OVERDUE_SWEEP_MS = 60_000;

// Until registration there are no deps, so the public entry points below stay
// no-ops rather than throwing.
let registered = false;

export function registerMessengerAutomation(deps: AutomationDeps): void {
  setAutomationDeps(deps);
  registered = true;

  ipcMain.handle(
    "messenger-automation-start",
    async (_event, serviceId: unknown, spec: unknown): Promise<StartResult> => {
      const fail = (error: string): StartResult => ({ ok: false, error, tasks: publicTasks() });

      if (typeof serviceId !== "string") return fail("Invalid service");
      const service = deps.getServices().find((s) => s.id === serviceId);
      if (!service) return fail("Service not found");
      try {
        if (!new URL(service.url).hostname.includes("messenger")) {
          return fail("Automation is only available for Messenger services");
        }
      } catch {
        return fail("Invalid service URL");
      }
      const view = deps.getServiceView(serviceId);
      if (!view || view.webContents.isDestroyed()) {
        return fail("Service is not loaded");
      }
      if (
        typeof spec !== "object" ||
        spec === null ||
        typeof (spec as TaskSpec).type !== "string"
      ) {
        return fail("Invalid task");
      }
      const taskSpec = spec as TaskSpec;
      const validationError = validateSpec(taskSpec);
      if (validationError) return fail(validationError);

      if (taskSpec.type === "sendChatMessage") {
        // Immediate one-off — never enters the task list
        const result = await inject(serviceId, buildTypeAndSendScript(taskSpec.message));
        if (result !== "sent") {
          return fail(
            result === "no-input"
              ? "Chat input not found — open a conversation first"
              : result === "no-send-button"
                ? "Send button not found"
                : "Service is not loaded",
          );
        }
        return { ok: true, tasks: publicTasks() };
      }

      if (taskSpec.type === "sendEmoji") {
        // Remember the emoji so the panel can offer it again next time.
        deps
          .getUiView()
          ?.webContents.send(
            "messenger-automation-recent-emojis",
            deps.recordRecentEmoji(taskSpec.emoji),
          );
      }

      launchTask(serviceId, taskSpec);

      pushUpdate();
      return { ok: true, tasks: publicTasks() };
    },
  );

  ipcMain.handle("messenger-automation-stop", (_event, taskId: unknown): AutomationTask[] => {
    if (typeof taskId === "string") stopTask(taskId);
    return publicTasks();
  });

  ipcMain.handle(
    "messenger-automation-stop-all",
    (_event, serviceId: unknown): AutomationTask[] => {
      if (typeof serviceId === "string") stopAllForService(serviceId);
      return publicTasks();
    },
  );

  // Catch timers that drifted across an OS suspend, plus an explicit check when
  // the machine wakes.
  const overdueSweep = setInterval(sweepOverdue, OVERDUE_SWEEP_MS);
  overdueSweep.unref?.();
  try {
    powerMonitor.on("resume", sweepOverdue);
  } catch {
    // powerMonitor is unavailable before app-ready on some platforms
  }

  ipcMain.handle("messenger-automation-list", (): AutomationTask[] => publicTasks());

  ipcMain.handle("messenger-automation-recent-emojis", (): string[] => deps.getRecentEmojis());

  // Arm (or re-arm) an auto-stop for a service: after `minutes`, every task for
  // that service is cleared. Passing null cancels an armed auto-stop.
  ipcMain.handle(
    "messenger-automation-set-auto-stop",
    (_event, serviceId: unknown, minutes: unknown): AutoStopResult => {
      if (typeof serviceId !== "string") {
        return { ok: false, error: "Invalid service", autoStop: null };
      }
      if (minutes === null) {
        clearAutoStop(serviceId, false);
        return { ok: true, autoStop: null };
      }
      const validationError = validateAutoStopMinutes(minutes);
      if (validationError) {
        return { ok: false, error: validationError, autoStop: publicAutoStop(serviceId) };
      }
      armAutoStop(serviceId, minutes as number, stopAllForService);
      return { ok: true, autoStop: publicAutoStop(serviceId) };
    },
  );

  ipcMain.handle(
    "messenger-automation-get-auto-stop",
    (_event, serviceId: unknown): AutoStopState | null =>
      typeof serviceId === "string" ? publicAutoStop(serviceId) : null,
  );
}

/**
 * Restore the tasks and auto-stops stored by the previous run. Called from main
 * once service views exist — a task with nowhere to inject would be torn down
 * again the moment it fired.
 */
export function restoreAutomationState(): void {
  if (!registered) return;
  restorePersistedTasks();
  restorePersistedAutoStops(stopAllForService);
}

/**
 * End all automation for a service straight away. Disabling or removing a
 * service means "stop doing things with this account", so its tasks and
 * auto-stop end now. Without this, a task only noticed on its next run, which
 * for a scheduled message could be hours later.
 */
export function stopAutomationForService(serviceId: string): void {
  if (!registered) return;
  stopAllForService(serviceId);
}

/**
 * Whether a service has scheduled or running automation. Hibernation asks
 * before tearing a view down, since destroying it stops every task (issue #76).
 */
export function hasAutomationForService(serviceId: string): boolean {
  for (const task of tasks.values()) {
    if (task.serviceId === serviceId) return true;
  }
  return false;
}

/** Whether any service has scheduled or running automation (issue #73). */
export function hasAnyAutomation(): boolean {
  return tasks.size > 0;
}
