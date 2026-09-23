import { randomUUID } from "crypto";
import type { TaskSpec } from "../shared/types";
import { LivenessAction, livenessFor } from "../automationLiveness";
import { InternalTask, deps, pushUpdate, tasks } from "./runtime";
import { clearAutoStop } from "./autoStop";

// Creating and stopping tasks, and deciding what a task does when its view is
// missing. Shared by every kind of task (tasks.ts, callCycle.ts, restore.ts).

export function createTask(serviceId: string, spec: TaskSpec): InternalTask {
  const task: InternalTask = {
    id: randomUUID(),
    serviceId,
    spec,
    status: "running",
    nextFireAt: null,
    fireCount: 0,
    createdAt: Date.now(),
    timer: null,
    noticeTimer: null,
  };
  tasks.set(task.id, task);
  return task;
}

// hangUp defaults true so user-initiated stops also close a ringing call
// popup. The answered path passes false — the call connected and must stay.
export function stopTask(taskId: string, hangUp = true): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;
  if (task.timer) clearTimeout(task.timer);
  if (task.noticeTimer) clearTimeout(task.noticeTimer);
  if (hangUp && task.spec.type === "startCallCycle") deps().closeCallWindow(task.serviceId);
  tasks.delete(taskId);
  pushUpdate();
  return true;
}

export function stopAllForService(serviceId: string) {
  let removed = false;
  for (const task of [...tasks.values()]) {
    if (task.serviceId === serviceId) {
      if (task.timer) clearTimeout(task.timer);
      if (task.noticeTimer) clearTimeout(task.noticeTimer);
      if (task.spec.type === "startCallCycle") deps().closeCallWindow(serviceId);
      tasks.delete(task.id);
      removed = true;
    }
  }
  if (removed) pushUpdate();
  // The arm exists to clear this service's tasks; once they're gone (stopped
  // by hand, by the timer itself, or because the view closed) it has no job
  // left, so a fresh batch of tasks isn't killed by a stale countdown.
  clearAutoStop(serviceId);
}

// What to do when an injection found no view. Only the service itself going
// away ends a task now; a view that is merely absent (hibernated, rebuilt,
// dropped when the window closed) means wait for it to come back.
function liveness(serviceId: string): LivenessAction {
  const view = deps().getServiceView(serviceId);
  return livenessFor({
    service: deps()
      .getServices()
      .find((s) => s.id === serviceId),
    viewPresent: !!view && !view.webContents.isDestroyed(),
  });
}

/**
 * Handle an injection that couldn't run. Returns true when the task is over
 * and the caller should give up, false when it should reschedule as normal.
 *
 * The status line is only pushed when it actually changes — the call cycle
 * polls every two seconds, and a push writes the task list to disk.
 */
export function handleMissingView(taskId: string, serviceId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return true;
  const state = liveness(serviceId);
  // The service is gone or switched off; the panel goes with it, so there is
  // nothing left to report the reason to.
  if (state.action === "stop") {
    stopTask(taskId);
    return true;
  }
  if (state.action === "wait" && task.lastResult !== state.reason) {
    task.lastResult = state.reason;
    pushUpdate();
  }
  return false;
}
