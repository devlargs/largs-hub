import type { AutomationPrefs, TaskSpec } from "./shared/types";

// Checks the Messenger automation panel's saved settings (AutomationPrefs)
// before they're stored or handed back. Only the shape is checked here; the
// ranges are checked when a task is started (messengerAutomation/validation.ts).
// Pure (test/automationPrefs.test.ts).

const TASK_TYPES: readonly TaskSpec["type"][] = [
  "sendChatMessage",
  "sendChat",
  "sendChatInterval",
  "sendEmoji",
  "startCallCycle",
  "sendRandomFromList",
];

// A number the way an <input type="number"> holds it: digits only, short
const NUMBER_FIELD = /^\d{1,6}$/;
const TIME_FIELD = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_EMOJI_LENGTH = 32;
const MAX_ID_LENGTH = 128;

const NUMBER_KEYS = ["fromSec", "toSec", "maxLength", "ringSeconds", "autoStopMinutes"] as const;

/** The valid fields of `raw`; anything missing or malformed is left out. */
export function sanitizeAutomationPrefs(raw: unknown): AutomationPrefs {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const prefs: AutomationPrefs = {};
  if (TASK_TYPES.includes(r.type as TaskSpec["type"])) prefs.type = r.type as TaskSpec["type"];
  if (typeof r.time === "string" && TIME_FIELD.test(r.time)) prefs.time = r.time;
  for (const key of NUMBER_KEYS) {
    const value = r[key];
    if (typeof value === "string" && NUMBER_FIELD.test(value)) prefs[key] = value;
  }
  if (typeof r.emoji === "string" && r.emoji.trim() && r.emoji.length <= MAX_EMOJI_LENGTH) {
    prefs.emoji = r.emoji;
  }
  if (
    typeof r.listGroupId === "string" &&
    r.listGroupId.length > 0 &&
    r.listGroupId.length <= MAX_ID_LENGTH
  ) {
    prefs.listGroupId = r.listGroupId;
  }
  return prefs;
}

/** The stored map, with entries for unknown services and junk values dropped. */
export function sanitizeStoredPrefs(
  raw: unknown,
  serviceIds: readonly string[],
): Record<string, AutomationPrefs> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, AutomationPrefs> = {};
  for (const [serviceId, value] of Object.entries(raw)) {
    if (serviceIds.includes(serviceId)) result[serviceId] = sanitizeAutomationPrefs(value);
  }
  return result;
}
