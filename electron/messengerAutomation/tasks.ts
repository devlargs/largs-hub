import { randomUUID } from "crypto";
import type { AutomationTask, TaskSpec } from "../shared/types";
import { LivenessAction, livenessFor } from "../automationLiveness";
import { pickNextIndex } from "../messageLists";
import { planTaskRestore, restorableTasks } from "../automationRestore";
import { InternalTask, deps, inject, pushUpdate, sendToUi, tasks } from "./runtime";
import { buildTypeAndSendScript, CLICK_CALL_SCRIPT, NOTICE_SCRIPT } from "./scripts";
import { NoticeSignals, detectNotice, isNoticeSignals } from "./notice";
import { clearAutoStop } from "./autoStop";

// The task scheduler: arming, looping, stopping and restoring tasks. Timers
// live here in the main process so tasks survive page reloads and keep running
// while the view is hidden or another service is active; only the scripts in
// scripts.ts are injected into the Messenger view, at fire time.

// How often the call cycle re-reads the conversation for a reaction.
const NOTICE_POLL_MS = 2000;
// How late a task must be before the overdue sweep counts its timer as drifted.
const OVERDUE_SLACK_MS = 30_000;

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
function handleMissingView(taskId: string, serviceId: string): boolean {
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

function createTask(serviceId: string, spec: TaskSpec): InternalTask {
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

// `fireAt` is only passed by the launch-time restore, which already knows the
// moment this task was armed for; a fresh schedule works it out from HHMM.
function startSendChat(
  serviceId: string,
  spec: Extract<TaskSpec, { type: "sendChat" }>,
  fireAt?: number,
) {
  let target = fireAt;
  if (target === undefined) {
    const hours = parseInt(spec.time.slice(0, 2), 10);
    const minutes = parseInt(spec.time.slice(2, 4), 10);
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= Date.now()) {
      next.setDate(next.getDate() + 1);
    }
    target = next.getTime();
  }

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

function randomDelayMs(fromSec: number, toSec: number): number {
  return Math.floor(Math.random() * (toSec - fromSec + 1) + fromSec) * 1000;
}

// The call cycle is its own loop (not startLoop) because each fire has an
// inner ring→answer phase: click "Start a voice call" (which opens the in-app
// call popup and auto-starts it), ring for ringSeconds, then either stop
// because she answered or hang up and wait for the next attempt.
function startCallCycle(serviceId: string, spec: Extract<TaskSpec, { type: "startCallCycle" }>) {
  const task = createTask(serviceId, spec);

  // Watch the conversation for any sign the cycle worked (a reply, a "Seen"
  // receipt, a typing indicator) and stop nagging the moment one shows up.
  // The answered-call case is handled separately, below.
  let baseline: NoticeSignals | null = null;
  const pollNotice = async () => {
    if (!tasks.has(task.id)) return;
    const signals = await inject<NoticeSignals>(serviceId, NOTICE_SCRIPT);
    if (!tasks.has(task.id)) return;
    if (signals === null) {
      // The watcher must not be what ends the cycle: the view can be absent
      // for a moment while the task itself is still perfectly valid.
      if (handleMissingView(task.id, serviceId)) return;
      task.noticeTimer = setTimeout(pollNotice, NOTICE_POLL_MS);
      return;
    }
    if (isNoticeSignals(signals)) {
      if (!baseline) {
        baseline = signals;
      } else {
        const reason = detectNotice(baseline, signals);
        if (reason) {
          // Hang up the (still ringing) call and end the cycle — she noticed.
          // Tell the UI why: the task is already gone from the list by then,
          // so the reason has nowhere else to surface.
          stopTask(task.id);
          sendToUi("messenger-automation-notice", { serviceId, reason });
          return;
        }
      }
    }
    task.noticeTimer = setTimeout(pollNotice, NOTICE_POLL_MS);
  };
  pollNotice();

  const scheduleNext = () => {
    const delayMs = randomDelayMs(spec.fromSec, spec.toSec);
    task.nextFireAt = Date.now() + delayMs;
    pushUpdate();
    task.timer = setTimeout(async () => {
      if (!tasks.has(task.id)) return;
      // Mark the popup this click is about to open — cycle calls open silent
      // and minimized.
      deps().armAutomationCall(serviceId);
      const result = await inject(serviceId, CLICK_CALL_SCRIPT);
      if (result === null) {
        if (handleMissingView(task.id, serviceId)) return;
        scheduleNext();
        return;
      }
      if (!tasks.has(task.id)) return;
      task.fireCount++;
      task.lastResult = result;
      task.nextFireAt = null; // ringing now — no countdown until the retry
      pushUpdate();

      if (result !== "clicked") {
        // No call button (e.g. no conversation open) — nothing rang; retry.
        scheduleNext();
        return;
      }

      const answered = await deps().monitorCallForAnswer(serviceId, spec.ringSeconds * 1000);
      if (!tasks.has(task.id)) return; // stopped while ringing

      if (answered) {
        // She picked up — stop nagging and leave the connected call open.
        stopTask(task.id, false);
        return;
      }
      // No answer — the monitor already closed the popup; wait, then retry.
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
        () =>
          buildTypeAndSendScript(
            taskSpec.emoji.repeat(1 + Math.floor(Math.random() * taskSpec.maxLength)),
          ),
      );
      return;
    case "startCallCycle":
      startCallCycle(serviceId, taskSpec);
      return;
  }
}

// --- Launch-time restore -----------------------------------------------------

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
