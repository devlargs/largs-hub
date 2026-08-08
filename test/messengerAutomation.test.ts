import { describe, expect, it } from "vitest";
import {
  detectNotice,
  isNoticeSignals,
  NoticeSignals,
  validateSpec,
  TaskSpec,
} from "../electron/messengerAutomation";

describe("validateSpec", () => {
  describe("sendChat", () => {
    it("accepts a valid message and HHMM time", () => {
      expect(validateSpec({ type: "sendChat", message: "hi", time: "0930" })).toBeNull();
    });

    it("rejects empty and oversized messages", () => {
      expect(validateSpec({ type: "sendChat", message: "", time: "0930" })).toBe(
        "Message is required",
      );
      expect(validateSpec({ type: "sendChat", message: "a".repeat(5001), time: "0930" })).toBe(
        "Message is required",
      );
    });

    it("rejects non-HHMM time formats", () => {
      expect(validateSpec({ type: "sendChat", message: "hi", time: "9:30" })).toBe(
        "Time must be in HHMM format",
      );
    });

    it("rejects out-of-range hours and minutes", () => {
      expect(validateSpec({ type: "sendChat", message: "hi", time: "2460" })).toBe("Invalid time");
    });
  });

  describe("sendChatInterval", () => {
    it("accepts a valid interval", () => {
      expect(
        validateSpec({ type: "sendChatInterval", message: "hi", fromSec: 1, toSec: 5 }),
      ).toBeNull();
    });

    it("rejects sub-second and inverted intervals", () => {
      expect(validateSpec({ type: "sendChatInterval", message: "hi", fromSec: 0, toSec: 5 })).toBe(
        "Interval seconds must be at least 1",
      );
      expect(validateSpec({ type: "sendChatInterval", message: "hi", fromSec: 9, toSec: 5 })).toBe(
        "Min seconds must not exceed max seconds",
      );
    });
  });

  describe("sendEmoji", () => {
    const valid: TaskSpec = { type: "sendEmoji", emoji: "😀", fromSec: 1, toSec: 2, maxLength: 3 };

    it("accepts a valid spec", () => {
      expect(validateSpec(valid)).toBeNull();
    });

    it("rejects a missing emoji", () => {
      expect(validateSpec({ ...valid, emoji: "" })).toBe("Emoji is required");
    });

    it("bounds maxLength to 1-100 integers", () => {
      expect(validateSpec({ ...valid, maxLength: 0 })).toBe("Max repeat must be between 1 and 100");
      expect(validateSpec({ ...valid, maxLength: 101 })).toBe(
        "Max repeat must be between 1 and 100",
      );
      expect(validateSpec({ ...valid, maxLength: 2.5 })).toBe(
        "Max repeat must be between 1 and 100",
      );
    });
  });

  describe("startCallCycle", () => {
    it("accepts a valid wait range", () => {
      expect(
        validateSpec({ type: "startCallCycle", fromSec: 5, toSec: 120, ringSeconds: 30 }),
      ).toBeNull();
    });

    it("requires at least 5 seconds of wait on both ends", () => {
      expect(
        validateSpec({ type: "startCallCycle", fromSec: 4, toSec: 120, ringSeconds: 30 }),
      ).toBe("Wait seconds must be at least 5");
      expect(validateSpec({ type: "startCallCycle", fromSec: 30, toSec: 4, ringSeconds: 30 })).toBe(
        "Wait seconds must be at least 5",
      );
      expect(
        validateSpec({ type: "startCallCycle", fromSec: NaN, toSec: 120, ringSeconds: 30 }),
      ).toBe("Wait seconds must be at least 5");
    });

    it("rejects an inverted wait range", () => {
      expect(
        validateSpec({ type: "startCallCycle", fromSec: 120, toSec: 30, ringSeconds: 30 }),
      ).toBe("Min seconds must not exceed max seconds");
    });

    it("requires at least 5 seconds of ring", () => {
      expect(
        validateSpec({ type: "startCallCycle", fromSec: 30, toSec: 120, ringSeconds: 4 }),
      ).toBe("Ring seconds must be at least 5");
      expect(
        validateSpec({ type: "startCallCycle", fromSec: 30, toSec: 120, ringSeconds: NaN }),
      ).toBe("Ring seconds must be at least 5");
    });
  });

  it("rejects unknown task types", () => {
    expect(validateSpec({ type: "explode" } as unknown as TaskSpec)).toBe("Unknown task type");
  });
});

describe("detectNotice", () => {
  const base: NoticeSignals = { count: 10, last: "hey", seen: false, typing: false };

  it("returns null when nothing changed", () => {
    expect(detectNotice(base, { ...base })).toBeNull();
  });

  it("detects a new message in the thread", () => {
    expect(detectNotice(base, { ...base, count: 11, last: "what" })).toBe("replied");
  });

  it("detects a changed last message even when the count holds", () => {
    expect(detectNotice(base, { ...base, last: "what" })).toBe("replied");
  });

  it("detects a seen receipt appearing", () => {
    expect(detectNotice(base, { ...base, seen: true })).toBe("seen");
  });

  it("detects a typing indicator appearing", () => {
    expect(detectNotice(base, { ...base, typing: true })).toBe("typing");
  });

  it("ignores signals that were already true at baseline", () => {
    const noticed: NoticeSignals = { ...base, seen: true, typing: true };
    expect(detectNotice(noticed, { ...noticed })).toBeNull();
  });

  it("ignores rows disappearing (virtualized list scrolling)", () => {
    expect(detectNotice(base, { ...base, count: 4 })).toBeNull();
  });

  it("ignores an empty read, which means the thread isn't rendered", () => {
    expect(detectNotice(base, { ...base, last: "" })).toBeNull();
  });
});

describe("isNoticeSignals", () => {
  it("accepts a well-formed read", () => {
    expect(isNoticeSignals({ count: 1, last: "hi", seen: false, typing: false })).toBe(true);
  });

  it("rejects the injector's error sentinel and malformed reads", () => {
    expect(isNoticeSignals("error")).toBe(false);
    expect(isNoticeSignals(null)).toBe(false);
    expect(isNoticeSignals({ count: 1 })).toBe(false);
  });
});
