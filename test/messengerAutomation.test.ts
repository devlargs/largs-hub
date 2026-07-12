import { describe, expect, it } from "vitest";
import { validateSpec, TaskSpec } from "../electron/messengerAutomation";

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
    it("requires at least 5 seconds of wait", () => {
      expect(validateSpec({ type: "startCallCycle", waitSeconds: 5 })).toBeNull();
      expect(validateSpec({ type: "startCallCycle", waitSeconds: 4 })).toBe(
        "Wait seconds must be at least 5",
      );
      expect(validateSpec({ type: "startCallCycle", waitSeconds: NaN })).toBe(
        "Wait seconds must be at least 5",
      );
    });
  });

  it("rejects unknown task types", () => {
    expect(validateSpec({ type: "explode" } as unknown as TaskSpec)).toBe("Unknown task type");
  });
});
