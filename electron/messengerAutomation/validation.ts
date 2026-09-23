import type { TaskSpec } from "../shared/types";
import { MAX_MESSAGE_LENGTH, MAX_GROUP_MESSAGES } from "../messageLists";

// Pure validation for task specs and auto-stop durations, unit-testable
// without an Electron runtime.

// Bounds for the auto-stop duration (1 minute to 24 hours).
const MIN_AUTO_STOP_MINUTES = 1;
const MAX_AUTO_STOP_MINUTES = 1440;

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

export function validateAutoStopMinutes(minutes: unknown): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || !Number.isInteger(minutes)) {
    return "Minutes must be a whole number";
  }
  if (minutes < MIN_AUTO_STOP_MINUTES || minutes > MAX_AUTO_STOP_MINUTES) {
    return `Minutes must be between ${MIN_AUTO_STOP_MINUTES} and ${MAX_AUTO_STOP_MINUTES}`;
  }
  return null;
}
