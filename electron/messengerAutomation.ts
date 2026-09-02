import { ipcMain, powerMonitor, WebContentsView } from "electron";
import { randomUUID } from "crypto";
import { LivenessAction, livenessFor } from "./automationLiveness";
import { MAX_MESSAGE_LENGTH, MAX_GROUP_MESSAGES, pickNextIndex } from "./messageLists";
import { isAutoStopStillArmed, planTaskRestore, restorableTasks } from "./automationRestore";

// Messenger automation: scheduling/looping lives here in the main process so
// tasks survive page reloads and keep running while the view is hidden or
// another service is active. Only the final "type + click send" script is
// injected into the Messenger WebContentsView at fire time.

export type TaskSpec =
  | { type: "sendChat"; message: string; time: string } // time = "HHMM"
  | { type: "sendChatInterval"; message: string; fromSec: number; toSec: number }
  | { type: "sendChatMessage"; message: string }
  | { type: "sendEmoji"; emoji: string; fromSec: number; toSec: number; maxLength: number }
  // A saved message list, resolved to its messages at start time: the task
  // carries the copy, so editing or deleting the list later can't disturb a
  // running cycle. One entry is picked per fire (never the same one twice in
  // a row) and sent after a random delay, like sendChatInterval.
  | { type: "sendRandomFromList"; name: string; messages: string[]; fromSec: number; toSec: number }
  // fromSec/toSec = random delay range between call attempts; ringSeconds = how
  // long to let it ring before hanging up an unanswered call and trying again.
  | { type: "startCallCycle"; fromSec: number; toSec: number; ringSeconds: number };

export interface AutomationTask {
  id: string;
  serviceId: string;
  spec: TaskSpec;
  status: "scheduled" | "running";
  nextFireAt: number | null;
  fireCount: number;
  lastResult?: string;
  createdAt: number;
}

export interface StartResult {
  ok: boolean;
  error?: string;
  tasks: AutomationTask[];
}

// An armed auto-stop: every task for the service is cleared when it expires.
export interface AutoStopState {
  serviceId: string;
  minutes: number;
  expiresAt: number;
}

export interface AutoStopResult {
  ok: boolean;
  error?: string;
  autoStop: AutoStopState | null;
}

interface InternalTask extends AutomationTask {
  timer: NodeJS.Timeout | null;
  // Call cycle only: poll timer for the "she noticed you" watcher.
  noticeTimer: NodeJS.Timeout | null;
}

interface AutomationDeps {
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

const tasks = new Map<string, InternalTask>();
// Set by registerMessengerAutomation so main can trigger the restore once the
// service views it needs to inject into actually exist.
let restoreAll: () => void = () => {};
// Services that already have a webContents "destroyed" cleanup hook attached
// serviceId -> armed auto-stop (state + its timer). At most one per service.
const autoStops = new Map<string, AutoStopState & { timer: NodeJS.Timeout }>();

// Bounds for the auto-stop duration (1 minute to 24 hours).
const MIN_AUTO_STOP_MINUTES = 1;
const MAX_AUTO_STOP_MINUTES = 1440;
// How often the call cycle re-reads the conversation for a reaction.
const NOTICE_POLL_MS = 2000;
// How often the wall clock is re-checked for timers that drifted (OS sleep
// skews a long setTimeout), and how late a task must be before that counts.
const OVERDUE_SWEEP_MS = 60_000;
const OVERDUE_SLACK_MS = 30_000;

function toPublic(task: InternalTask): AutomationTask {
  const { timer: _timer, noticeTimer: _noticeTimer, ...publicTask } = task;
  return publicTask;
}

function publicTasks(): AutomationTask[] {
  return [...tasks.values()].map(toPublic);
}

// The message is embedded via JSON.stringify, so quotes/newlines/emoji in the
// text can't break out of the string literal.
function buildTypeAndSendScript(message: string): string {
  return `
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let input = null;
      for (let i = 0; i < 20 && !input; i++) {
        input = document.querySelector('div[contenteditable="true"]');
        if (!input) await wait(100);
      }
      if (!input) return "no-input";
      input.focus();
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, ${JSON.stringify(message)});
      for (let i = 0; i < 20; i++) {
        const btn = document.querySelector('div[aria-label="Press enter to send"]');
        if (btn) { btn.click(); return "sent"; }
        await wait(100);
      }
      return "no-send-button";
    })()
  `;
}

const CLICK_CALL_SCRIPT = `
  (() => {
    const btn = document.querySelector('div[aria-label="Start a voice call"]');
    if (btn) { btn.click(); return "clicked"; }
    return "no-call-button";
  })()
`;

// --- "She noticed you" detection (call cycle) ---------------------------------
// The cycle exists to get someone's attention, so any sign it worked should end
// it — not just a picked-up call. These signals are read out of the open
// Messenger conversation and compared against a baseline taken when the cycle
// starts.

export interface NoticeSignals {
  // Message rows in the open thread, excluding call system rows ("You called…")
  // which the cycle itself creates.
  count: number;
  // Text of the last such row — catches a reply that lands while the list is
  // virtualized and the row count happens not to move.
  last: string;
  // A "Seen" read receipt is showing in the thread.
  seen: boolean;
  // The other person is typing.
  typing: boolean;
}

// Best-effort DOM read: Messenger ships no stable hooks, so this keys on role
// attributes and aria-labels and may need updating if their UI changes.
const NOTICE_SCRIPT = `
  (() => {
    // Rows the call cycle itself produces — ignore them, they aren't a reply.
    const CALL_ROW = /\\b(call|calling|called|ringing|missed|unanswered)\\b/i;
    const rows = [];
    for (const row of document.querySelectorAll('div[role="row"]')) {
      const text = (row.innerText || "").trim();
      if (!text || CALL_ROW.test(text)) continue;
      rows.push(text);
    }
    let seen = false;
    let typing = false;
    for (const el of document.querySelectorAll('[aria-label]')) {
      const label = el.getAttribute('aria-label') || '';
      if (!seen && /\\bseen\\b/i.test(label)) seen = true;
      if (!typing && /is typing|typing\\u2026|typing\\.\\.\\./i.test(label)) typing = true;
      if (seen && typing) break;
    }
    return { count: rows.length, last: rows[rows.length - 1] || "", seen, typing };
  })()
`;

export function isNoticeSignals(value: unknown): value is NoticeSignals {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<NoticeSignals>;
  return (
    typeof v.count === "number" &&
    typeof v.last === "string" &&
    typeof v.seen === "boolean" &&
    typeof v.typing === "boolean"
  );
}

// Returns a short reason string when `now` shows a reaction that `base` didn't,
// or null while nothing has changed. Only transitions count, so a thread that
// was already "Seen" before the cycle started doesn't cancel it immediately.
export type NoticeReason = "replied" | "seen" | "typing";

export function detectNotice(base: NoticeSignals, now: NoticeSignals): NoticeReason | null {
  if (now.typing && !base.typing) return "typing";
  if (now.seen && !base.seen) return "seen";
  if (now.count > base.count) return "replied";
  if (now.last && base.last && now.last !== base.last) return "replied";
  return null;
}

// Pure spec validation, hoisted to module scope so it's unit-testable.
export function validateSpec(spec: TaskSpec): string | null {
  const validMessage = (msg: unknown) =>
    typeof msg === "string" && msg.length > 0 && msg.length <= MAX_MESSAGE_LENGTH;
  const validSeconds = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 1;

  switch (spec.type) {
    case "sendChat": {
      if (!validMessage(spec.message)) return "Message is required";
      if (typeof spec.time !== "string" || !/^\d{4}$/.test(spec.time)) {
        return "Time must be in HHMM format";
      }
      const hours = parseInt(spec.time.slice(0, 2), 10);
      const minutes = parseInt(spec.time.slice(2, 4), 10);
      if (hours > 23 || minutes > 59) return "Invalid time";
      return null;
    }
    case "sendChatInterval":
      if (!validMessage(spec.message)) return "Message is required";
      if (!validSeconds(spec.fromSec) || !validSeconds(spec.toSec)) {
        return "Interval seconds must be at least 1";
      }
      if (spec.fromSec > spec.toSec) return "Min seconds must not exceed max seconds";
      return null;
    case "sendChatMessage":
      if (!validMessage(spec.message)) return "Message is required";
      return null;
    case "sendRandomFromList": {
      if (typeof spec.name !== "string" || spec.name.trim().length === 0) {
        return "Pick a list first";
      }
      if (!Array.isArray(spec.messages) || spec.messages.length === 0) {
        return "The list has no messages";
      }
      if (spec.messages.length > MAX_GROUP_MESSAGES) {
        return `A list can hold at most ${MAX_GROUP_MESSAGES} messages`;
      }
      if (!spec.messages.every(validMessage)) return "The list has a blank or over-long message";
      if (!validSeconds(spec.fromSec) || !validSeconds(spec.toSec)) {
        return "Interval seconds must be at least 1";
      }
      if (spec.fromSec > spec.toSec) return "Min seconds must not exceed max seconds";
      return null;
    }
    case "sendEmoji":
      if (typeof spec.emoji !== "string" || spec.emoji.length === 0 || spec.emoji.length > 100) {
        return "Emoji is required";
      }
      if (!validSeconds(spec.fromSec) || !validSeconds(spec.toSec)) {
        return "Interval seconds must be at least 1";
      }
      if (spec.fromSec > spec.toSec) return "Min seconds must not exceed max seconds";
      if (
        typeof spec.maxLength !== "number" ||
        !Number.isInteger(spec.maxLength) ||
        spec.maxLength < 1 ||
        spec.maxLength > 100
      ) {
        return "Max repeat must be between 1 and 100";
      }
      return null;
    case "startCallCycle":
      if (
        typeof spec.fromSec !== "number" ||
        !Number.isFinite(spec.fromSec) ||
        spec.fromSec < 5 ||
        typeof spec.toSec !== "number" ||
        !Number.isFinite(spec.toSec) ||
        spec.toSec < 5
      ) {
        return "Wait seconds must be at least 5";
      }
      if (spec.fromSec > spec.toSec) return "Min seconds must not exceed max seconds";
      if (
        typeof spec.ringSeconds !== "number" ||
        !Number.isFinite(spec.ringSeconds) ||
        spec.ringSeconds < 5
      ) {
        return "Ring seconds must be at least 5";
      }
      return null;
    default:
      return "Unknown task type";
  }
}

// Pure validation for the auto-stop duration, kept beside validateSpec so it's
// unit-testable without an Electron runtime.
export function validateAutoStopMinutes(minutes: unknown): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || !Number.isInteger(minutes)) {
    return "Minutes must be a whole number";
  }
  if (minutes < MIN_AUTO_STOP_MINUTES || minutes > MAX_AUTO_STOP_MINUTES) {
    return `Minutes must be between ${MIN_AUTO_STOP_MINUTES} and ${MAX_AUTO_STOP_MINUTES}`;
  }
  return null;
}

export function registerMessengerAutomation(deps: AutomationDeps): void {
  // Every task-list change goes to disk as well as to the panel, so a quit at
  // any point leaves something restorable (issue #75).
  function pushUpdate() {
    deps.savePersistedTasks(publicTasks());
    const ui = deps.getUiView();
    if (ui && !ui.webContents.isDestroyed()) {
      ui.webContents.send("messenger-automation-updated", publicTasks());
    }
  }

  function persistAutoStops() {
    deps.savePersistedAutoStops(
      [...autoStops.values()].map(({ timer: _timer, ...state }) => state),
    );
  }

  // Tell the UI why a call cycle cancelled itself — the task is already gone
  // from the list by then, so the reason has nowhere else to surface.
  function notifyNotice(serviceId: string, reason: NoticeReason) {
    const ui = deps.getUiView();
    if (ui && !ui.webContents.isDestroyed()) {
      ui.webContents.send("messenger-automation-notice", { serviceId, reason });
    }
  }

  function publicAutoStop(serviceId: string): AutoStopState | null {
    const armed = autoStops.get(serviceId);
    if (!armed) return null;
    const { timer: _timer, ...state } = armed;
    return state;
  }

  // `fired` marks the push that follows an expired auto-stop, so the panel can
  // say why the task list emptied instead of silently clearing it.
  function pushAutoStop(serviceId: string, fired = false) {
    persistAutoStops();
    const ui = deps.getUiView();
    if (ui && !ui.webContents.isDestroyed()) {
      ui.webContents.send("messenger-automation-auto-stop-updated", {
        serviceId,
        autoStop: publicAutoStop(serviceId),
        fired,
      });
    }
  }

  // Cancel an armed auto-stop without touching the running tasks. Silent by
  // default so callers can decide whether the UI needs a push.
  function clearAutoStop(serviceId: string, notify = true) {
    const armed = autoStops.get(serviceId);
    if (!armed) return false;
    clearTimeout(armed.timer);
    autoStops.delete(serviceId);
    if (notify) pushAutoStop(serviceId);
    else persistAutoStops();
    return true;
  }

  // Arm (or re-arm) a service's auto-stop. `expiresAt` is only supplied by the
  // launch-time restore, which is picking up an arm that's already counting.
  function armAutoStop(serviceId: string, minutes: number, expiresAt?: number) {
    clearAutoStop(serviceId, false);
    const target = expiresAt ?? Date.now() + minutes * 60_000;
    const timer = setTimeout(
      () => {
        // Drop the arm first so stopAllForService's own cleanup is a no-op and
        // the UI gets one push per side (tasks, then arm).
        autoStops.delete(serviceId);
        stopAllForService(serviceId);
        pushAutoStop(serviceId, true);
      },
      Math.max(0, target - Date.now()),
    );
    autoStops.set(serviceId, { serviceId, minutes, expiresAt: target, timer });
    persistAutoStops();
  }

  // Returns null when the view is gone — callers stop the task in that case.
  async function inject<T = string>(serviceId: string, code: string): Promise<T | "error" | null> {
    const view = deps.getServiceView(serviceId);
    if (!view || view.webContents.isDestroyed()) return null;
    try {
      return (await view.webContents.executeJavaScript(code, true)) as T;
    } catch {
      return "error";
    }
  }

  // What to do when an injection found no view. Only the service itself going
  // away ends a task now; a view that is merely absent (hibernated, rebuilt,
  // dropped when the window closed) means wait for it to come back.
  function liveness(serviceId: string): LivenessAction {
    const view = deps.getServiceView(serviceId);
    return livenessFor({
      service: deps.getServices().find((s) => s.id === serviceId),
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
  function stopTask(taskId: string, hangUp = true): boolean {
    const task = tasks.get(taskId);
    if (!task) return false;
    if (task.timer) clearTimeout(task.timer);
    if (task.noticeTimer) clearTimeout(task.noticeTimer);
    if (hangUp && task.spec.type === "startCallCycle") deps.closeCallWindow(task.serviceId);
    tasks.delete(taskId);
    pushUpdate();
    return true;
  }

  function stopAllForService(serviceId: string) {
    let removed = false;
    for (const task of [...tasks.values()]) {
      if (task.serviceId === serviceId) {
        if (task.timer) clearTimeout(task.timer);
        if (task.noticeTimer) clearTimeout(task.noticeTimer);
        if (task.spec.type === "startCallCycle") deps.closeCallWindow(serviceId);
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

  // Stop a service's tasks when its view is closed (service removed, disabled,
  // or URL changed) — covers every view-close site without touching them.
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
            stopTask(task.id);
            notifyNotice(serviceId, reason);
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
        deps.armAutomationCall(serviceId);
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

        const answered = await deps.monitorCallForAnswer(serviceId, spec.ringSeconds * 1000);
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

  // --- Launch-time restore ---------------------------------------------------

  // Rehydrate tasks stored by the previous run. Called once views exist — a
  // task needs a live service view to inject into, so restoring before that
  // would tear everything down again immediately.
  function restorePersistedTasks() {
    const stored = restorableTasks(deps.loadPersistedTasks(), deps.getServiceIds());
    if (stored.length === 0) {
      // Still write back: this clears tasks whose service has since been removed.
      deps.savePersistedTasks([]);
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
      const ui = deps.getUiView();
      if (ui && !ui.webContents.isDestroyed()) {
        ui.webContents.send("messenger-automation-missed", missed);
      }
    }
  }

  function restorePersistedAutoStops() {
    const stored = deps.loadPersistedAutoStops();
    if (!Array.isArray(stored)) return;
    const now = Date.now();
    for (const entry of stored) {
      if (typeof entry?.serviceId !== "string") continue;
      // An arm that ran out while the app was closed must not clear a fresh
      // batch of tasks the moment the app opens.
      if (!isAutoStopStillArmed(entry.expiresAt, now)) continue;
      armAutoStop(entry.serviceId, entry.minutes, entry.expiresAt);
    }
    persistAutoStops();
  }

  // Long timers don't survive OS sleep accurately — a setTimeout armed for
  // 21:00 can come back from suspend having lost hours. Re-check the wall clock
  // periodically and on resume, and fire anything that's overdue.
  function sweepOverdue() {
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

  // Arm one task's timers. Shared by the start handler and the launch-time
  // restore, so a rehydrated task behaves exactly like a freshly started one.
  function launchTask(serviceId: string, taskSpec: TaskSpec, options?: { fireAt?: number }) {
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

  restoreAll = () => {
    restorePersistedTasks();
    restorePersistedAutoStops();
  };

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
      armAutoStop(serviceId, minutes as number);
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
  restoreAll();
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
