import type { MessageListGroup, NoticeReason, TaskSpec } from "../types";

// The Messenger automation panel's form, labels and formatting, kept free of
// React so they can be unit-tested.

export type TaskType = TaskSpec["type"];

export const FUNCTION_TABS: Array<{ type: TaskType; label: string }> = [
  { type: "sendChatMessage", label: "Send now" },
  { type: "sendChat", label: "Schedule" },
  { type: "sendChatInterval", label: "Interval" },
  { type: "sendEmoji", label: "Emoji" },
  { type: "startCallCycle", label: "Call cycle" },
  { type: "sendRandomFromList", label: "Random list" },
];

export const TASK_LABELS: Record<TaskType, string> = {
  sendChatMessage: "Send now",
  sendChat: "Scheduled message",
  sendChatInterval: "Interval messages",
  sendEmoji: "Emoji bursts",
  startCallCycle: "Call cycle",
  sendRandomFromList: "Random list",
};

const RESULT_LABELS: Record<string, string> = {
  "no-input": "Chat input not found — open a conversation",
  "no-send-button": "Send button not found",
  "no-call-button": "Call button not found",
  error: "Could not run in the page",
};

export const NOTICE_LABELS: Record<NoticeReason, string> = {
  replied: "they replied",
  seen: "your message was seen",
  typing: "they started typing",
};

export const HELPER_TEXT: Partial<Record<TaskType, string>> = {
  sendChatMessage: "Sends into the conversation currently open in Messenger.",
  sendChat: "Fires at the chosen time — if it already passed today, it fires tomorrow.",
  sendChatInterval: "Repeats the message at a random delay between min and max seconds.",
  sendEmoji: "Sends 1 to max-repeat copies of the emoji at a random delay.",
  sendRandomFromList:
    "Sends a message picked at random from the chosen list, never the same one twice in a row, at a random delay between min and max seconds.",
  startCallCycle:
    "Calls in an in-app popup at a random delay between min and max seconds. If a call isn't answered within “Wait to ring” seconds, the popup is closed and the cycle restarts. When the call is answered it stops and keeps the call open. It also stops on its own as soon as the conversation shows a reply, a “Seen” receipt, or a typing indicator.",
};

// The human-readable reason a task's last run failed, or null when it didn't
// (or failed in a way the panel has no wording for).
export function resultLabel(lastResult: string | undefined): string | null {
  return lastResult && RESULT_LABELS[lastResult] ? RESULT_LABELS[lastResult] : null;
}

export function missedMessage(count: number): string {
  return count === 1
    ? "A scheduled message was missed while the app was closed"
    : `${count} scheduled messages were missed while the app was closed`;
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function taskPreview(spec: TaskSpec): string {
  switch (spec.type) {
    case "sendChat":
    case "sendChatInterval":
    case "sendChatMessage":
      return spec.message;
    case "sendEmoji":
      return `${spec.emoji} ×1-${spec.maxLength}`;
    case "startCallCycle":
      return `every ${spec.fromSec}-${spec.toSec}s · ring ${spec.ringSeconds}s`;
    case "sendRandomFromList":
      return `${spec.name} · ${spec.messages.length} messages`;
  }
}

// What the user has typed into the form. Numbers stay strings until the spec
// is built, the way the inputs hold them.
export interface AutomationForm {
  type: TaskType;
  message: string;
  time: string;
  fromSec: string;
  toSec: string;
  emoji: string;
  maxLength: string;
  ringSeconds: string;
  // The list chosen in the "Random list" tab, resolved to its messages on start
  listGroup: MessageListGroup | null;
}

export const DEFAULT_FORM: AutomationForm = {
  type: "sendChatMessage",
  message: "",
  time: "00:00",
  fromSec: "30",
  toSec: "120",
  emoji: "❤️",
  maxLength: "5",
  ringSeconds: "30",
  listGroup: null,
};

// The spec to send to main, or null when the Random list tab has no list yet.
// Range checks are main's job (messengerAutomation/validation.ts).
export function buildSpec(form: AutomationForm): TaskSpec | null {
  const num = (value: string) => Number(value);
  const { message, fromSec, toSec } = form;
  switch (form.type) {
    case "sendChatMessage":
      return { type: "sendChatMessage", message };
    case "sendChat":
      return { type: "sendChat", message, time: form.time.replace(":", "") };
    case "sendChatInterval":
      return { type: "sendChatInterval", message, fromSec: num(fromSec), toSec: num(toSec) };
    case "sendEmoji":
      return {
        type: "sendEmoji",
        emoji: form.emoji,
        fromSec: num(fromSec),
        toSec: num(toSec),
        maxLength: num(form.maxLength),
      };
    case "startCallCycle":
      return {
        type: "startCallCycle",
        fromSec: num(fromSec),
        toSec: num(toSec),
        ringSeconds: num(form.ringSeconds),
      };
    case "sendRandomFromList":
      if (!form.listGroup) return null;
      return {
        type: "sendRandomFromList",
        name: form.listGroup.name,
        messages: form.listGroup.messages,
        fromSec: num(fromSec),
        toSec: num(toSec),
      };
  }
}

export function needsMessage(type: TaskType): boolean {
  return type === "sendChatMessage" || type === "sendChat" || type === "sendChatInterval";
}

export function needsInterval(type: TaskType): boolean {
  return (
    type === "sendChatInterval" ||
    type === "sendEmoji" ||
    type === "startCallCycle" ||
    type === "sendRandomFromList"
  );
}

// The call cycle uses the same random min/max delay as the other loops, but
// its attempts can't be closer together than the ring window allows.
export function intervalMin(type: TaskType): number {
  return type === "startCallCycle" ? 5 : 1;
}

export function startLabel(type: TaskType): string {
  return type === "sendChatMessage" ? "Send" : type === "sendChat" ? "Schedule" : "Start";
}

export function canStart(form: AutomationForm): boolean {
  return (
    (!needsMessage(form.type) || form.message.trim().length > 0) &&
    (form.type !== "sendEmoji" || form.emoji.trim().length > 0) &&
    (form.type !== "sendRandomFromList" || form.listGroup !== null)
  );
}
