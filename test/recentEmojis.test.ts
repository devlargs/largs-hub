import { describe, expect, it } from "vitest";
import { MAX_RECENT_EMOJIS, addRecentEmoji, sanitizeRecentEmojis } from "../electron/recentEmojis";

describe("sanitizeRecentEmojis", () => {
  it("keeps a well-formed list in order", () => {
    expect(sanitizeRecentEmojis(["❤️", "🔥"])).toEqual(["❤️", "🔥"]);
  });

  it("returns an empty list for anything that isn't an array", () => {
    expect(sanitizeRecentEmojis(undefined)).toEqual([]);
    expect(sanitizeRecentEmojis("❤️")).toEqual([]);
  });

  it("drops non-strings, blanks and over-long entries", () => {
    expect(sanitizeRecentEmojis(["❤️", 3, "", "   ", "x".repeat(101), "🔥"])).toEqual(["❤️", "🔥"]);
  });

  it("drops duplicates, keeping the first occurrence", () => {
    expect(sanitizeRecentEmojis(["❤️", "🔥", "❤️"])).toEqual(["❤️", "🔥"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_RECENT_EMOJIS + 5 }, (_, i) => `e${i}`);
    expect(sanitizeRecentEmojis(many)).toHaveLength(MAX_RECENT_EMOJIS);
  });
});

describe("addRecentEmoji", () => {
  it("puts a new emoji at the front", () => {
    expect(addRecentEmoji(["🔥"], "❤️")).toEqual(["❤️", "🔥"]);
  });

  it("moves a re-used emoji to the front instead of duplicating it", () => {
    expect(addRecentEmoji(["🔥", "❤️", "✨"], "❤️")).toEqual(["❤️", "🔥", "✨"]);
  });

  it("trims before storing", () => {
    expect(addRecentEmoji([], "  ❤️  ")).toEqual(["❤️"]);
  });

  it("ignores a blank, over-long, or non-string emoji", () => {
    expect(addRecentEmoji(["🔥"], "   ")).toEqual(["🔥"]);
    expect(addRecentEmoji(["🔥"], "x".repeat(101))).toEqual(["🔥"]);
    expect(addRecentEmoji(["🔥"], 7)).toEqual(["🔥"]);
  });

  it("drops the oldest entry once the cap is reached", () => {
    const full = Array.from({ length: MAX_RECENT_EMOJIS }, (_, i) => `e${i}`);
    const updated = addRecentEmoji(full, "new");
    expect(updated).toHaveLength(MAX_RECENT_EMOJIS);
    expect(updated[0]).toBe("new");
    expect(updated).not.toContain(`e${MAX_RECENT_EMOJIS - 1}`);
  });

  it("recovers from a corrupted stored value", () => {
    expect(addRecentEmoji("nonsense", "❤️")).toEqual(["❤️"]);
  });
});
