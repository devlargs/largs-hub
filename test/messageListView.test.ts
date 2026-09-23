import { describe, expect, it } from "vitest";
import {
  filterLists,
  messageCountLabel,
  paginate,
  parseMessages,
} from "../src/lib/messageListView";
import type { MessageListGroup } from "../electron/shared/types";

const group = (name: string, updatedAt: number): MessageListGroup => ({
  id: name,
  name,
  messages: [],
  createdAt: 0,
  updatedAt,
});

describe("parseMessages", () => {
  it("takes one message per line, trimmed, skipping blank lines", () => {
    expect(parseMessages("  hi \n\n  \nhello there\n")).toEqual(["hi", "hello there"]);
    expect(parseMessages("")).toEqual([]);
  });
});

describe("messageCountLabel", () => {
  it("pluralises", () => {
    expect(messageCountLabel(0)).toBe("0 messages");
    expect(messageCountLabel(1)).toBe("1 message");
    expect(messageCountLabel(2)).toBe("2 messages");
  });
});

describe("filterLists", () => {
  const lists = [group("Morning", 1), group("Evening", 3), group("good MORNING", 2)];

  it("puts the most recently changed first", () => {
    expect(filterLists(lists, "").map((g) => g.name)).toEqual([
      "Evening",
      "good MORNING",
      "Morning",
    ]);
  });

  it("matches the name, ignoring case and surrounding spaces", () => {
    expect(filterLists(lists, "  morning ").map((g) => g.name)).toEqual([
      "good MORNING",
      "Morning",
    ]);
  });

  it("leaves the input list alone", () => {
    filterLists(lists, "");
    expect(lists.map((g) => g.name)).toEqual(["Morning", "Evening", "good MORNING"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it("slices out the requested page", () => {
    expect(paginate(items, 1)).toEqual({
      items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      page: 1,
      pageCount: 3,
    });
    expect(paginate(items, 2).items).toEqual([20, 21, 22]);
  });

  it("clamps a page past the end to the last one", () => {
    expect(paginate(items, 9).page).toBe(2);
    expect(paginate([1, 2], 3)).toEqual({ items: [1, 2], page: 0, pageCount: 1 });
  });

  it("has one empty page for no items", () => {
    expect(paginate([], 0)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});
