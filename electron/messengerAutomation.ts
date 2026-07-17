import { ipcMain, WebContentsView } from "electron";
import { randomUUID } from "crypto";

// Messenger automation: scheduling/looping lives here in the main process so
// tasks survive page reloads and keep running while the view is hidden or
// another service is active. Only the final "type + click send" script is
// injected into the Messenger WebContentsView at fire time.

export type TaskSpec =
  | { type: "sendChat"; message: string; time: string } // time = "HHMM"
  | { type: "sendChatInterval"; message: string; fromSec: number; toSec: number }
  | { type: "sendChatMessage"; message: string }
  | { type: "sendEmoji"; emoji: string; fromSec: number; toSec: number; maxLength: number }
  // waitSeconds = delay between call attempts; ringSeconds = how long to let it
  // ring before hanging up an unanswered call and trying again.
  | { type: "startCallCycle"; waitSeconds: number; ringSeconds: number };

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

interface InternalTask extends AutomationTask {
  timer: NodeJS.Timeout | null;
}

interface AutomationDeps {
  getServiceView: (serviceId: string) => WebContentsView | undefined;
  getServices: () => Array<{ id: string; url: string }>;
  getUiView: () => WebContentsView | null;
  // Ring an in-app call for up to timeoutMs; resolves true if answered, false
  // on timeout (popup is closed by the callee). Owned by serviceViews.
  monitorCallForAnswer: (serviceId: string, timeoutMs: number) => Promise<boolean>;
  // Hang up / close the in-app call popup for a service, if one is open.
  closeCallWindow: (serviceId: string) => void;
}

const tasks = new Map<string, InternalTask>();
// Services that already have a webContents "destroyed" cleanup hook attached
const hookedServices = new Set<string>();

const MAX_MESSAGE_LENGTH = 5000;

function toPublic(task: InternalTask): AutomationTask {
  const { timer: _timer, ...publicTask } = task;
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

// Pure spec validation, hoisted to module scope so it's unit-testable.
export function validateSpec(spec: TaskSpec): string | null {
  const validMessage = (msg: unknown) =>
    typeof msg === "string" && msg.length > 0 && msg.length <= MAX_MESSAGE_LENGTH;
  const validSeconds = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 1;

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
        typeof spec.waitSeconds !== "number" ||
        !Number.isFinite(spec.waitSeconds) ||
        spec.waitSeconds < 5
      ) {
        return "Wait seconds must be at least 5";
      }
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

export function registerMessengerAutomation(deps: AutomationDeps): void {
  function pushUpdate() {
    const ui = deps.getUiView();
    if (ui && !ui.webContents.isDestroyed()) {
      ui.webContents.send("messenger-automation-updated", publicTasks());
    }
  }

  // Returns null when the view is gone — callers stop the task in that case.
  async function inject(serviceId: string, code: string): Promise<string | null> {
    const view = deps.getServiceView(serviceId);
    if (!view || view.webContents.isDestroyed()) return null;
    try {
      return await view.webContents.executeJavaScript(code, true);
    } catch {
      return "error";
    }
  }

  function stopTask(taskId: string): boolean {
    const task = tasks.get(taskId);
    if (!task) return false;
    if (task.timer) clearTimeout(task.timer);
    tasks.delete(taskId);
    pushUpdate();
    return true;
  }

  function stopAllForService(serviceId: string) {
    let removed = false;
    for (const task of [...tasks.values()]) {
      if (task.serviceId === serviceId) {
        if (task.timer) clearTimeout(task.timer);
        tasks.delete(task.id);
        removed = true;
      }
    }
    if (removed) pushUpdate();
  }

  // Stop a service's tasks when its view is closed (service removed, disabled,
  // or URL changed) — covers every view-close site without touching them.
  function ensureCleanupHook(serviceId: string) {
    if (hookedServices.has(serviceId)) return;
    const view = deps.getServiceView(serviceId);
    if (!view || view.webContents.isDestroyed()) return;
    hookedServices.add(serviceId);
    view.webContents.once("destroyed", () => {
      hookedServices.delete(serviceId);
      stopAllForService(serviceId);
    });
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
    };
    tasks.set(task.id, task);
    return task;
  }

  function startSendChat(serviceId: string, spec: Extract<TaskSpec, { type: "sendChat" }>) {
    const hours = parseInt(spec.time.slice(0, 2), 10);
    const minutes = parseInt(spec.time.slice(2, 4), 10);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }

    const task = createTask(serviceId, spec);
    task.status = "scheduled";
    task.nextFireAt = target.getTime();
    task.timer = setTimeout(async () => {
      await inject(serviceId, buildTypeAndSendScript(spec.message));
      tasks.delete(task.id);
      pushUpdate();
    }, target.getTime() - Date.now());
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
          stopTask(task.id);
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
      if (typeof spec !== "object" || spec === null || typeof (spec as TaskSpec).type !== "string") {
        return fail("Invalid task");
      }
      const taskSpec = spec as TaskSpec;
      const validationError = validateSpec(taskSpec);
      if (validationError) return fail(validationError);

      ensureCleanupHook(serviceId);

      switch (taskSpec.type) {
        case "sendChatMessage": {
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
        case "sendChat":
          startSendChat(serviceId, taskSpec);
          break;
        case "sendChatInterval":
          startLoop(
            serviceId,
            taskSpec,
            () => randomDelayMs(taskSpec.fromSec, taskSpec.toSec),
            () => buildTypeAndSendScript(taskSpec.message),
          );
          break;
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
          break;
        case "startCallCycle":
          startLoop(
            serviceId,
            taskSpec,
            () => taskSpec.waitSeconds * 1000,
            () => CLICK_CALL_SCRIPT,
          );
          break;
      }

      pushUpdate();
      return { ok: true, tasks: publicTasks() };
    },
  );

  ipcMain.handle("messenger-automation-stop", (_event, taskId: unknown): AutomationTask[] => {
    if (typeof taskId === "string") stopTask(taskId);
    return publicTasks();
  });

  ipcMain.handle("messenger-automation-stop-all", (_event, serviceId: unknown): AutomationTask[] => {
    if (typeof serviceId === "string") stopAllForService(serviceId);
    return publicTasks();
  });

  ipcMain.handle("messenger-automation-list", (): AutomationTask[] => publicTasks());
}
