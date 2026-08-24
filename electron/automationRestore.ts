import type { AutomationTask, TaskSpec } from "./shared/types";

// Deciding what to do with a Messenger automation task that was stored when the
// app closed.
//
// Tasks used to live only in an in-memory Map, so everything disappeared on
// quit. The scheduled type suffered most: "send at 21:00" armed at 09:00 needs a
// twelve-hour timer to survive a process that quits itself after an hour of no
// input (issue #75). They're persisted now, so a launch has to work out which
// are still worth running.
//
// Pure so it can be unit-tested without an Electron runtime.

/** How late a one-shot scheduled send may be and still be worth firing. */
export const MISSED_GRACE_MS = 60 * 60 * 1000;

/** Marker left on a task whose scheduled moment passed while the app was shut. */
export const MISSED_RESULT = "missed-while-closed";

export type RestorePlan =
  /** Re-arm as it was; the moment hasn't passed. */
  | { action: "rearm"; delayMs: number }
  /** Overdue but inside the grace window — send it now. */
  | { action: "fire-now" }
  /** Long overdue; keep it listed with an explanation instead of firing. */
  | { action: "drop"; reason: string };

/** Repeating types get a fresh delay rather than resuming a stale countdown. */
export function isLoopingSpec(spec: TaskSpec): boolean {
  return (
    spec.type === "sendChatInterval" ||
    spec.type === "sendEmoji" ||
    spec.type === "sendRandomFromList" ||
    spec.type === "startCallCycle"
  );
}

/**
 * What to do with one stored task at launch.
 *
 * Looping tasks always restart with a fresh delay — the exact phase of an
 * interval carries no meaning, and resuming a countdown from before a reboot
 * would fire immediately for no reason.
 *
 * A one-shot scheduled send is the interesting case: still in the future means
 * re-arm, recently missed means fire now (better a late message than a silently
 * dropped one), and long missed means drop it with a reason the panel can show
 * — sending yesterday's 9am message at 4pm today would be worse than not.
 */
export function planTaskRestore(
  task: AutomationTask,
  now: number,
  graceMs: number = MISSED_GRACE_MS,
): RestorePlan {
  if (isLoopingSpec(task.spec)) return { action: "rearm", delayMs: 0 };

  if (task.nextFireAt === null) return { action: "drop", reason: MISSED_RESULT };

  const remaining = task.nextFireAt - now;
  if (remaining > 0) return { action: "rearm", delayMs: remaining };
  if (-remaining <= graceMs) return { action: "fire-now" };
  return { action: "drop", reason: MISSED_RESULT };
}

/** A stored task is only trusted if it still looks like one. */
export function isRestorableTask(raw: unknown): raw is AutomationTask {
  if (typeof raw !== "object" || raw === null) return false;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || t.id.length === 0) return false;
  if (typeof t.serviceId !== "string" || t.serviceId.length === 0) return false;
  if (typeof t.spec !== "object" || t.spec === null) return false;
  if (typeof (t.spec as TaskSpec).type !== "string") return false;
  return t.nextFireAt === null || typeof t.nextFireAt === "number";
}

/**
 * Drop tasks belonging to services that no longer exist, and anything
 * unreadable. Runs before restore so a removed service can't leave a task
 * firing into nothing.
 */
export function restorableTasks(raw: unknown, serviceIds: readonly string[]): AutomationTask[] {
  if (!Array.isArray(raw)) return [];
  const live = new Set(serviceIds);
  return raw.filter(
    (entry): entry is AutomationTask => isRestorableTask(entry) && live.has(entry.serviceId),
  );
}

/**
 * An armed auto-stop is only restored if it hasn't already expired — a timer
 * that ran out while the app was closed should not clear tasks on launch.
 */
export function isAutoStopStillArmed(expiresAt: unknown, now: number): boolean {
  return typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > now;
}
