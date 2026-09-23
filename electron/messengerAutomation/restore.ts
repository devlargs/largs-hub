import type { AutomationTask } from "../shared/types";
import { planTaskRestore, restorableTasks } from "../automationRestore";
import { deps, pushUpdate, sendToUi, tasks } from "./runtime";
import { stopTask } from "./lifecycle";
import { launchTask } from "./tasks";

// Bringing tasks back after a restart, and after the timers drifted in sleep.

// How late a task must be before the overdue sweep counts its timer as drifted.
const OVERDUE_SLACK_MS = 30_000;

// Rehydrate tasks stored by the previous run. Called once views exist — a
// task needs a live service view to inject into, so restoring before that
// would tear everything down again immediately.
export function restorePersistedTasks() {
  const stored = restorableTasks(deps().loadPersistedTasks(), deps().getServiceIds());
  if (stored.length === 0) {
    // Still write back: this clears tasks whose service has since been removed.
    deps().savePersistedTasks([]);
    return;
  }

  const now = Date.now();
  const missed: AutomationTask[] = [];
  for (const task of stored) {
    const plan = planTaskRestore(task, now);
    if (plan.action === "drop") {
      missed.push({ ...task, lastResult: plan.reason });
      continue;
    }
    if (plan.action === "fire-now") {
      // Late is better than never for a one-shot send, but only just — fire
      // it right away rather than re-arming for tomorrow.
      launchTask(task.serviceId, task.spec, { fireAt: now });
    } else {
      launchTask(
        task.serviceId,
        task.spec,
        plan.delayMs > 0 ? { fireAt: now + plan.delayMs } : undefined,
      );
    }
  }

  pushUpdate();
  if (missed.length > 0) {
    // The panel would otherwise just show an empty list with no explanation.
    sendToUi("messenger-automation-missed", missed);
  }
}

// Long timers don't survive OS sleep accurately — a setTimeout armed for
// 21:00 can come back from suspend having lost hours. Re-checked on the wall
// clock periodically and on resume; anything overdue fires now.
export function sweepOverdue() {
  const now = Date.now();
  for (const task of [...tasks.values()]) {
    if (task.nextFireAt === null || task.nextFireAt > now) continue;
    // More than a slack window late means the timer really did drift.
    if (now - task.nextFireAt < OVERDUE_SLACK_MS) continue;
    if (task.spec.type !== "sendChat") continue; // loops self-correct
    const { serviceId, spec } = task;
    stopTask(task.id);
    launchTask(serviceId, spec, { fireAt: now });
  }
}
