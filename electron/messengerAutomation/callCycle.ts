import type { TaskSpec } from "../shared/types";
import { deps, inject, pushUpdate, sendToUi, tasks } from "./runtime";
import { CLICK_CALL_SCRIPT, NOTICE_SCRIPT } from "./scripts";
import { NoticeSignals, detectNotice, isNoticeSignals } from "./notice";
import { createTask, handleMissingView, stopTask } from "./lifecycle";
import { randomDelayMs } from "./schedule";

// How often the call cycle re-reads the conversation for a reaction.
const NOTICE_POLL_MS = 2000;

// The call cycle is its own loop (not startLoop in tasks.ts) because each fire
// has an inner ring→answer phase: click "Start a voice call" (which opens the
// in-app call popup and auto-starts it), ring for ringSeconds, then either stop
// because she answered or hang up and wait for the next attempt.
export function startCallCycle(
  serviceId: string,
  spec: Extract<TaskSpec, { type: "startCallCycle" }>,
) {
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
