import { describe, expect, it } from "vitest";
import {
  MISSED_GRACE_MS,
  MISSED_RESULT,
  isAutoStopStillArmed,
  isLoopingSpec,
  isRestorableTask,
  planTaskRestore,
  restorableTasks,
} from "../electron/automationRestore";
import type { AutomationTask, TaskSpec } from "../electron/shared/types";

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const scheduled: TaskSpec = { type: "sendChat", message: "hi", time: "2100" };
const interval: TaskSpec = { type: "sendChatInterval", message: "hi", fromSec: 30, toSec: 60 };

const task = (overrides: Partial<AutomationTask> = {}): AutomationTask => ({
  id: "t1",
  serviceId: "svc",
  spec: scheduled,
  status: "scheduled",
  nextFireAt: NOW + 60 * MIN,
  fireCount: 0,
  createdAt: NOW - 60 * MIN,
  ...overrides,
});

describe("isLoopingSpec", () => {
  it("recognises the repeating types", () => {
    expect(isLoopingSpec(interval)).toBe(true);
    expect(
      isLoopingSpec({ type: "sendEmoji", emoji: "x", fromSec: 1, toSec: 2, maxLength: 3 }),
    ).toBe(true);
    expect(
      isLoopingSpec({
        type: "sendRandomFromList",
        name: "n",
        messages: ["a"],
        fromSec: 1,
        toSec: 2,
      }),
    ).toBe(true);
    expect(isLoopingSpec({ type: "startCallCycle", fromSec: 5, toSec: 6, ringSeconds: 5 })).toBe(
      true,
    );
  });

  it("does not treat the one-shot types as looping", () => {
    expect(isLoopingSpec(scheduled)).toBe(false);
    expect(isLoopingSpec({ type: "sendChatMessage", message: "hi" })).toBe(false);
  });
});

describe("planTaskRestore", () => {
  it("restarts a looping task with a fresh delay", () => {
    // The phase of an interval carries no meaning, and resuming a countdown
    // from before a reboot would fire immediately for no reason.
    const plan = planTaskRestore(task({ spec: interval, nextFireAt: NOW - 999 * MIN }), NOW);
    expect(plan).toEqual({ action: "rearm", delayMs: 0 });
  });

  it("re-arms a scheduled send that is still in the future", () => {
    const plan = planTaskRestore(task({ nextFireAt: NOW + 30 * MIN }), NOW);
    expect(plan).toEqual({ action: "rearm", delayMs: 30 * MIN });
  });

  it("fires a scheduled send that was recently missed", () => {
    expect(planTaskRestore(task({ nextFireAt: NOW - 5 * MIN }), NOW)).toEqual({
      action: "fire-now",
    });
  });

  it("fires one that is missed by exactly the grace window", () => {
    expect(planTaskRestore(task({ nextFireAt: NOW - MISSED_GRACE_MS }), NOW)).toEqual({
      action: "fire-now",
    });
  });

  it("drops a scheduled send missed by more than the grace window", () => {
    // Sending yesterday's 9am message at 4pm today is worse than not sending.
    expect(planTaskRestore(task({ nextFireAt: NOW - MISSED_GRACE_MS - 1 }), NOW)).toEqual({
      action: "drop",
      reason: MISSED_RESULT,
    });
  });

  it("drops a one-shot with no fire time at all", () => {
    expect(planTaskRestore(task({ nextFireAt: null }), NOW).action).toBe("drop");
  });

  it("honours a custom grace window", () => {
    expect(planTaskRestore(task({ nextFireAt: NOW - 5 * MIN }), NOW, MIN).action).toBe("drop");
  });
});

describe("isRestorableTask", () => {
  it("accepts a well-formed task", () => {
    expect(isRestorableTask(task())).toBe(true);
    expect(isRestorableTask(task({ nextFireAt: null }))).toBe(true);
  });

  it("rejects anything missing the fields restore relies on", () => {
    expect(isRestorableTask(null)).toBe(false);
    expect(isRestorableTask("task")).toBe(false);
    expect(isRestorableTask({ ...task(), id: "" })).toBe(false);
    expect(isRestorableTask({ ...task(), serviceId: 7 })).toBe(false);
    expect(isRestorableTask({ ...task(), spec: null })).toBe(false);
    expect(isRestorableTask({ ...task(), spec: {} })).toBe(false);
    expect(isRestorableTask({ ...task(), nextFireAt: "soon" })).toBe(false);
  });
});

describe("restorableTasks", () => {
  it("keeps tasks whose service still exists", () => {
    expect(restorableTasks([task()], ["svc"])).toHaveLength(1);
  });

  // A task firing into a service that was removed would inject nowhere.
  it("drops tasks for services that are gone", () => {
    expect(restorableTasks([task()], ["other"])).toEqual([]);
    expect(restorableTasks([task()], [])).toEqual([]);
  });

  it("drops unreadable entries without losing the rest", () => {
    const good = task({ id: "keep" });
    expect(restorableTasks([{ id: "bad" }, good, null], ["svc"]).map((t) => t.id)).toEqual([
      "keep",
    ]);
  });

  it("returns nothing for a non-array", () => {
    expect(restorableTasks(undefined, ["svc"])).toEqual([]);
    expect(restorableTasks({}, ["svc"])).toEqual([]);
  });
});

describe("isAutoStopStillArmed", () => {
  it("is armed while the expiry is in the future", () => {
    expect(isAutoStopStillArmed(NOW + MIN, NOW)).toBe(true);
  });

  // An arm that ran out while the app was closed must not clear a fresh batch
  // of tasks the moment the app opens.
  it("is not armed once the expiry has passed", () => {
    expect(isAutoStopStillArmed(NOW - 1, NOW)).toBe(false);
    expect(isAutoStopStillArmed(NOW, NOW)).toBe(false);
  });

  it("rejects a nonsensical expiry", () => {
    expect(isAutoStopStillArmed(undefined, NOW)).toBe(false);
    expect(isAutoStopStillArmed("later", NOW)).toBe(false);
    expect(isAutoStopStillArmed(NaN, NOW)).toBe(false);
  });
});
