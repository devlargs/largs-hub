import type { TaskSpec } from "../shared/types";
import { pickNextIndex } from "../messageLists";
import { inject, pushUpdate, tasks } from "./runtime";
import { buildTypeAndSendScript } from "./scripts";
import { createTask, handleMissingView } from "./lifecycle";
import { startCallCycle } from "./callCycle";
import { emojiBurst, nextDailyFireAt, randomDelayMs } from "./schedule";

// The task scheduler: arming and looping tasks. Timers live here in the main
// process so tasks survive page reloads and keep running while the view is
// hidden or another service is active; only the scripts in scripts.ts are
// injected into the Messenger view, at fire time. Stopping is in lifecycle.ts,
// the call cycle in callCycle.ts, restoring after a restart in restore.ts.

// `fireAt` is only passed by the launch-time restore, which already knows the
// moment this task was armed for; a fresh schedule works it out from HHMM.
function startSendChat(
  serviceId: string,
  spec: Extract<TaskSpec, { type: "sendChat" }>,
  fireAt?: number,
) {
  const target = fireAt ?? nextDailyFireAt(spec.time, Date.now());
  const task = createTask(serviceId, spec);
  task.status = "scheduled";
  task.nextFireAt = target;
  task.timer = setTimeout(
    async () => {
      await inject(serviceId, buildTypeAndSendScript(spec.message));
      tasks.delete(task.id);
      pushUpdate();
    },
    Math.max(0, target - Date.now()),
  );
}

// Shared loop for the repeating task types: fire, then reschedule with a
// fresh delay AFTER the fire completes (matches the userscript's
// scheduleNext recursion — delays never overlap).
function startLoop(
  serviceId: string,
  spec: TaskSpec,
  getDelayMs: () => number,
  getScript: () => string,
) {
  const task = createTask(serviceId, spec);

  const scheduleNext = () => {
    const delayMs = getDelayMs();
    task.nextFireAt = Date.now() + delayMs;
    pushUpdate();
    task.timer = setTimeout(async () => {
      const result = await inject(serviceId, getScript());
      if (result === null) {
        // No view to inject into — park the task rather than losing it.
        if (handleMissingView(task.id, serviceId)) return;
        scheduleNext();
        return;
      }
      if (!tasks.has(task.id)) return; // stopped while firing
      task.fireCount++;
      task.lastResult = result;
      scheduleNext();
    }, delayMs);
  };

  scheduleNext();
}

// Arm one task's timers. Shared by the start handler and the launch-time
// restore, so a rehydrated task behaves exactly like a freshly started one.
export function launchTask(serviceId: string, taskSpec: TaskSpec, options?: { fireAt?: number }) {
  switch (taskSpec.type) {
    case "sendChatMessage":
      return; // immediate one-off, never a task
    case "sendChat":
      startSendChat(serviceId, taskSpec, options?.fireAt);
      return;
    case "sendChatInterval":
      startLoop(
        serviceId,
        taskSpec,
        () => randomDelayMs(taskSpec.fromSec, taskSpec.toSec),
        () => buildTypeAndSendScript(taskSpec.message),
      );
      return;
    case "sendRandomFromList": {
      // The picked index is the only state the cycle carries, so the "never
      // twice in a row" rule survives across fires without touching the spec.
      let lastIndex: number | null = null;
      startLoop(
        serviceId,
        taskSpec,
        () => randomDelayMs(taskSpec.fromSec, taskSpec.toSec),
        () => {
          lastIndex = pickNextIndex(taskSpec.messages.length, lastIndex);
          return buildTypeAndSendScript(taskSpec.messages[lastIndex]);
        },
      );
      return;
    }
    case "sendEmoji":
      startLoop(
        serviceId,
        taskSpec,
        () => randomDelayMs(taskSpec.fromSec, taskSpec.toSec),
        () => buildTypeAndSendScript(emojiBurst(taskSpec.emoji, taskSpec.maxLength)),
      );
      return;
    case "startCallCycle":
      startCallCycle(serviceId, taskSpec);
      return;
  }
}
