import { describe, expect, it } from "vitest";
import {
  MAX_GROUP_MESSAGES,
  MAX_GROUP_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  pickNextIndex,
  sanitizeMessageListGroup,
  sanitizeStoredGroups,
} from "../electron/messageLists";
import { validateSpec } from "../electron/messengerAutomation";

const validGroup = (overrides: Record<string, unknown> = {}) => ({
  id: "g1",
  name: "Morning lines",
  messages: ["something1", "something 2"],
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
});

describe("sanitizeMessageListGroup", () => {
  it("accepts a well-formed group", () => {
    const result = sanitizeMessageListGroup(validGroup());
    expect(result).toEqual({
      ok: true,
      group: {
        id: "g1",
        name: "Morning lines",
        messages: ["something1", "something 2"],
        createdAt: 100,
        updatedAt: 200,
      },
    });
  });

  it("trims the name but leaves messages as typed", () => {
    const result = sanitizeMessageListGroup(validGroup({ name: "  Spaced  " }));
    expect(result.ok && result.group.name).toBe("Spaced");
  });

  it("stamps missing timestamps with the supplied clock", () => {
    const result = sanitizeMessageListGroup(
      { id: "g1", name: "n", messages: ["a"] },
      1234,
    );
    expect(result.ok && result.group.createdAt).toBe(1234);
    expect(result.ok && result.group.updatedAt).toBe(1234);
  });

  it("rejects a missing or blank id", () => {
    expect(sanitizeMessageListGroup(validGroup({ id: "" }))).toEqual({
      ok: false,
      error: "Invalid list group",
    });
    expect(sanitizeMessageListGroup(validGroup({ id: 7 })).ok).toBe(false);
    expect(sanitizeMessageListGroup(null).ok).toBe(false);
  });

  it("rejects a blank or over-long name", () => {
    expect(sanitizeMessageListGroup(validGroup({ name: "   " }))).toEqual({
      ok: false,
      error: "Name is required",
    });
    const long = sanitizeMessageListGroup(validGroup({ name: "x".repeat(MAX_GROUP_NAME_LENGTH + 1) }));
    expect(long.ok).toBe(false);
  });

  it("rejects an empty list, a non-array, and a list that is too long", () => {
    expect(sanitizeMessageListGroup(validGroup({ messages: [] }))).toEqual({
      ok: false,
      error: "Add at least one message",
    });
    expect(sanitizeMessageListGroup(validGroup({ messages: "a" }))).toEqual({
      ok: false,
      error: "Messages are required",
    });
    const tooMany = Array.from({ length: MAX_GROUP_MESSAGES + 1 }, (_, i) => `m${i}`);
    expect(sanitizeMessageListGroup(validGroup({ messages: tooMany })).ok).toBe(false);
  });

  it("rejects blank and over-length entries", () => {
    expect(sanitizeMessageListGroup(validGroup({ messages: ["ok", "   "] }))).toEqual({
      ok: false,
      error: "Messages cannot be blank",
    });
    expect(sanitizeMessageListGroup(validGroup({ messages: ["ok", 3] })).ok).toBe(false);
    const long = sanitizeMessageListGroup(
      validGroup({ messages: ["x".repeat(MAX_MESSAGE_LENGTH + 1)] }),
    );
    expect(long.ok).toBe(false);
  });
});

describe("sanitizeStoredGroups", () => {
  it("drops unreadable entries instead of losing the whole list", () => {
    const groups = sanitizeStoredGroups([validGroup(), { id: "bad" }, validGroup({ id: "g2" })]);
    expect(groups.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("returns an empty list for anything that isn't an array", () => {
    expect(sanitizeStoredGroups(undefined)).toEqual([]);
    expect(sanitizeStoredGroups({})).toEqual([]);
  });
});

describe("pickNextIndex", () => {
  it("always returns 0 for a single-entry list", () => {
    expect(pickNextIndex(1, null)).toBe(0);
    expect(pickNextIndex(1, 0)).toBe(0);
  });

  it("picks uniformly across the list on the first fire", () => {
    expect(pickNextIndex(3, null, () => 0)).toBe(0);
    expect(pickNextIndex(3, null, () => 0.5)).toBe(1);
    expect(pickNextIndex(3, null, () => 0.99)).toBe(2);
  });

  it("never repeats the previous entry", () => {
    for (let last = 0; last < 4; last++) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
        expect(pickNextIndex(4, last, () => r)).not.toBe(last);
      }
    }
  });

  it("shifts past the excluded index so every other entry stays reachable", () => {
    // count 3, last 1 → the two candidates are 0 and 2
    expect(pickNextIndex(3, 1, () => 0)).toBe(0);
    expect(pickNextIndex(3, 1, () => 0.99)).toBe(2);
  });

  it("stays in range when random() returns its extremes", () => {
    expect(pickNextIndex(5, 2, () => 1)).toBeLessThan(5);
    expect(pickNextIndex(5, 2, () => 0)).toBeGreaterThanOrEqual(0);
  });

  it("falls back to a free pick when the stored index is out of range", () => {
    expect(pickNextIndex(3, 9, () => 0)).toBe(0);
    expect(pickNextIndex(3, -1, () => 0.99)).toBe(2);
  });
});

describe("validateSpec — sendRandomFromList", () => {
  const spec = (overrides: Record<string, unknown> = {}) =>
    ({
      type: "sendRandomFromList",
      name: "Morning lines",
      messages: ["a", "b"],
      fromSec: 30,
      toSec: 120,
      ...overrides,
    }) as never;

  it("accepts a valid spec", () => {
    expect(validateSpec(spec())).toBeNull();
  });

  it("requires a list name", () => {
    expect(validateSpec(spec({ name: "  " }))).toBe("Pick a list first");
  });

  it("requires at least one message", () => {
    expect(validateSpec(spec({ messages: [] }))).toBe("The list has no messages");
    expect(validateSpec(spec({ messages: "a" }))).toBe("The list has no messages");
  });

  it("rejects blank and over-long messages", () => {
    expect(validateSpec(spec({ messages: ["a", ""] }))).toBe(
      "The list has a blank or over-long message",
    );
    expect(validateSpec(spec({ messages: ["x".repeat(MAX_MESSAGE_LENGTH + 1)] }))).toBe(
      "The list has a blank or over-long message",
    );
  });

  it("caps the list length", () => {
    const messages = Array.from({ length: MAX_GROUP_MESSAGES + 1 }, (_, i) => `m${i}`);
    expect(validateSpec(spec({ messages }))).toContain("at most");
  });

  it("applies the same interval rules as the other loops", () => {
    expect(validateSpec(spec({ fromSec: 0 }))).toBe("Interval seconds must be at least 1");
    expect(validateSpec(spec({ fromSec: 120, toSec: 30 }))).toBe(
      "Min seconds must not exceed max seconds",
    );
  });
});
