import { describe, expect, it } from "vitest";
import {
  CALL_APPEAR_GRACE_MS,
  INITIAL_CALL_WATCH,
  isInPageCallState,
  stepCall,
} from "../electron/messengerAutomation/callState";

const TIMEOUT = 30_000;
const ringing = { active: true, timer: null };

describe("stepCall", () => {
  it("keeps ringing while the call UI shows no running timer", () => {
    const step = stepCall(INITIAL_CALL_WATCH, ringing, 2_000, TIMEOUT);
    expect(step.outcome).toBe("ringing");
    expect(step.watch.sawCall).toBe(true);
  });

  it("calls it answered once the timer advances", () => {
    let step = stepCall(INITIAL_CALL_WATCH, { active: true, timer: "0:01" }, 3_000, TIMEOUT);
    expect(step.outcome).toBe("ringing");
    step = stepCall(step.watch, { active: true, timer: "0:02" }, 4_000, TIMEOUT);
    expect(step.outcome).toBe("answered");
  });

  it("doesn't take a timer that stands still for an answer", () => {
    let step = stepCall(INITIAL_CALL_WATCH, { active: true, timer: "0:00" }, 3_000, TIMEOUT);
    step = stepCall(step.watch, { active: true, timer: "0:00" }, 4_000, TIMEOUT);
    expect(step.outcome).toBe("ringing");
  });

  it("is unanswered at the timeout", () => {
    expect(stepCall(INITIAL_CALL_WATCH, ringing, TIMEOUT, TIMEOUT).outcome).toBe("unanswered");
  });

  it("is unanswered when the call UI goes away after showing (declined)", () => {
    const { watch } = stepCall(INITIAL_CALL_WATCH, ringing, 2_000, TIMEOUT);
    const step = stepCall(watch, { active: false, timer: null }, 3_000, TIMEOUT);
    expect(step.outcome).toBe("unanswered");
  });

  it("waits a grace period for the call UI to appear", () => {
    const idle = { active: false, timer: null };
    expect(stepCall(INITIAL_CALL_WATCH, idle, 1_000, TIMEOUT).outcome).toBe("ringing");
    expect(stepCall(INITIAL_CALL_WATCH, null, 1_000, TIMEOUT).outcome).toBe("ringing");
    expect(stepCall(INITIAL_CALL_WATCH, idle, CALL_APPEAR_GRACE_MS + 1, TIMEOUT).outcome).toBe(
      "unanswered",
    );
  });

  it("doesn't end a seen call on a read that failed", () => {
    const { watch } = stepCall(INITIAL_CALL_WATCH, ringing, 2_000, TIMEOUT);
    expect(stepCall(watch, null, 3_000, TIMEOUT).outcome).toBe("ringing");
  });
});

describe("isInPageCallState", () => {
  it("accepts the script's shape only", () => {
    expect(isInPageCallState({ active: true, timer: "0:01" })).toBe(true);
    expect(isInPageCallState({ active: false, timer: null })).toBe(true);
    expect(isInPageCallState("error")).toBe(false);
    expect(isInPageCallState({ active: "yes", timer: null })).toBe(false);
  });
});
