import { describe, expect, it } from "vitest";
import {
  AutomationForm,
  DEFAULT_FORM,
  buildSpec,
  canStart,
  formatCountdown,
  intervalMin,
  missedMessage,
  needsInterval,
  needsMessage,
  resultLabel,
  startLabel,
  taskPreview,
} from "../src/lib/automationForm";
import type { MessageListGroup } from "../electron/shared/types";

const form = (overrides: Partial<AutomationForm> = {}): AutomationForm => ({
  ...DEFAULT_FORM,
  ...overrides,
});

const list: MessageListGroup = {
  id: "l1",
  name: "Greetings",
  messages: ["hi", "hello"],
  createdAt: 0,
  updatedAt: 0,
};

describe("formatCountdown", () => {
  it("shows minutes and zero-padded seconds under an hour", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("adds hours once past an hour", () => {
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
  });

  it("rounds partial seconds up and never goes negative", () => {
    expect(formatCountdown(1_001)).toBe("0:02");
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});

describe("taskPreview", () => {
  it("summarises each task type", () => {
    expect(taskPreview({ type: "sendChatMessage", message: "yo" })).toBe("yo");
    expect(
      taskPreview({ type: "sendEmoji", emoji: "🔥", fromSec: 1, toSec: 2, maxLength: 4 }),
    ).toBe("🔥 ×1-4");
    expect(taskPreview({ type: "startCallCycle", fromSec: 10, toSec: 20, ringSeconds: 30 })).toBe(
      "every 10-20s · ring 30s",
    );
    expect(
      taskPreview({
        type: "sendRandomFromList",
        name: "Greetings",
        messages: ["a", "b"],
        fromSec: 1,
        toSec: 2,
      }),
    ).toBe("Greetings · 2 messages");
  });
});

describe("buildSpec", () => {
  it("drops the colon from a scheduled time", () => {
    expect(buildSpec(form({ type: "sendChat", message: "hi", time: "07:30" }))).toEqual({
      type: "sendChat",
      message: "hi",
      time: "0730",
    });
  });

  it("turns the number fields into numbers", () => {
    expect(
      buildSpec(form({ type: "sendEmoji", emoji: "🔥", fromSec: "3", toSec: "9", maxLength: "7" })),
    ).toEqual({ type: "sendEmoji", emoji: "🔥", fromSec: 3, toSec: 9, maxLength: 7 });
    expect(buildSpec(form({ type: "startCallCycle", ringSeconds: "45" }))).toEqual({
      type: "startCallCycle",
      fromSec: 30,
      toSec: 120,
      ringSeconds: 45,
    });
  });

  it("needs a list for Random list", () => {
    expect(buildSpec(form({ type: "sendRandomFromList" }))).toBeNull();
    expect(buildSpec(form({ type: "sendRandomFromList", listGroup: list }))).toEqual({
      type: "sendRandomFromList",
      name: "Greetings",
      messages: ["hi", "hello"],
      fromSec: 30,
      toSec: 120,
    });
  });
});

describe("form requirements", () => {
  it("asks for a message only on the message tabs", () => {
    expect(needsMessage("sendChatMessage")).toBe(true);
    expect(needsMessage("sendChatInterval")).toBe(true);
    expect(needsMessage("sendEmoji")).toBe(false);
  });

  it("asks for an interval only on the looping tabs", () => {
    expect(needsInterval("sendChatMessage")).toBe(false);
    expect(needsInterval("sendChat")).toBe(false);
    expect(needsInterval("startCallCycle")).toBe(true);
    expect(needsInterval("sendRandomFromList")).toBe(true);
  });

  it("keeps call attempts at least 5 seconds apart", () => {
    expect(intervalMin("startCallCycle")).toBe(5);
    expect(intervalMin("sendEmoji")).toBe(1);
  });

  it("labels the start button by tab", () => {
    expect(startLabel("sendChatMessage")).toBe("Send");
    expect(startLabel("sendChat")).toBe("Schedule");
    expect(startLabel("sendEmoji")).toBe("Start");
  });

  it("can't start without the required input", () => {
    expect(canStart(form({ message: "   " }))).toBe(false);
    expect(canStart(form({ message: "hi" }))).toBe(true);
    expect(canStart(form({ type: "sendEmoji", emoji: " " }))).toBe(false);
    expect(canStart(form({ type: "sendRandomFromList" }))).toBe(false);
    expect(canStart(form({ type: "sendRandomFromList", listGroup: list }))).toBe(true);
    expect(canStart(form({ type: "startCallCycle" }))).toBe(true);
  });
});

describe("status text", () => {
  it("words a known failure and ignores the rest", () => {
    expect(resultLabel("no-input")).toBe("Chat input not found — open a conversation");
    expect(resultLabel("ok")).toBeNull();
    expect(resultLabel(undefined)).toBeNull();
  });

  it("counts missed messages", () => {
    expect(missedMessage(1)).toBe("A scheduled message was missed while the app was closed");
    expect(missedMessage(3)).toBe("3 scheduled messages were missed while the app was closed");
  });
});
