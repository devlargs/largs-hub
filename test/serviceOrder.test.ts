import { describe, expect, it } from "vitest";
import {
  compareServiceNames,
  moveBy,
  moveOnto,
  sortByName,
  withVisibleOrder,
} from "../src/lib/serviceOrder";

const names = (items: { name: string }[]) => items.map((i) => i.name);

describe("compareServiceNames", () => {
  it("orders by name", () => {
    expect(compareServiceNames("Discord", "Gmail")).toBeLessThan(0);
    expect(compareServiceNames("Slack", "Reddit")).toBeGreaterThan(0);
    expect(compareServiceNames("Notion", "Notion")).toBe(0);
  });

  it("ignores case, so a lowercase custom name isn't exiled to the end", () => {
    expect(compareServiceNames("todo", "Twitter / X")).toBeLessThan(0);
    expect(compareServiceNames("Zulip", "asana")).toBeGreaterThan(0);
  });

  it("orders embedded numbers by value, not by digit", () => {
    expect(compareServiceNames("Mail 2", "Mail 10")).toBeLessThan(0);
  });
});

describe("sortByName", () => {
  it("puts the preset grid in alphabetical order", () => {
    const presets = [
      { name: "Gmail" },
      { name: "Slack" },
      { name: "Discord" },
      { name: "WhatsApp" },
      { name: "Telegram" },
      { name: "Notion" },
      { name: "Todo" },
      { name: "Twitter / X" },
      { name: "Reddit" },
      { name: "LinkedIn" },
      { name: "Messenger" },
      { name: "Google Chat" },
      { name: "Letterboxd" },
    ];
    expect(names(sortByName(presets))).toEqual([
      "Discord",
      "Gmail",
      "Google Chat",
      "Letterboxd",
      "LinkedIn",
      "Messenger",
      "Notion",
      "Reddit",
      "Slack",
      "Telegram",
      "Todo",
      "Twitter / X",
      "WhatsApp",
    ]);
  });

  it("leaves the list it was given alone", () => {
    const presets = [{ name: "Slack" }, { name: "Gmail" }];
    sortByName(presets);
    expect(names(presets)).toEqual(["Slack", "Gmail"]);
  });

  it("keeps the rest of each entry intact", () => {
    expect(sortByName([{ name: "Notes", type: "notion-notes" }])).toEqual([
      { name: "Notes", type: "notion-notes" },
    ]);
  });
});

describe("moveOnto", () => {
  const ids = ["a", "b", "c", "d"];

  it("puts the dragged service where the target was", () => {
    expect(moveOnto(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveOnto(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("changes nothing when dropped on itself or an unknown id", () => {
    expect(moveOnto(ids, "b", "b")).toBeNull();
    expect(moveOnto(ids, "zzz", "b")).toBeNull();
    expect(moveOnto(ids, "b", "zzz")).toBeNull();
  });

  it("leaves the input alone", () => {
    moveOnto(ids, "a", "d");
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moveBy", () => {
  const ids = ["a", "b", "c"];

  it("moves one place up or down", () => {
    expect(moveBy(ids, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveBy(ids, "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("stops at either end", () => {
    expect(moveBy(ids, "a", -1)).toBeNull();
    expect(moveBy(ids, "c", 1)).toBeNull();
    expect(moveBy(ids, "zzz", 1)).toBeNull();
  });
});

describe("withVisibleOrder", () => {
  // b and d are hidden; the sidebar shows a, c, e
  const all = ["a", "b", "c", "d", "e"];

  it("reorders the shown services and leaves the hidden ones in place", () => {
    expect(withVisibleOrder(all, ["e", "a", "c"])).toEqual(["e", "b", "a", "d", "c"]);
  });

  it("never drops a service", () => {
    const result = withVisibleOrder(all, ["c", "a", "e"]);
    expect([...result].sort()).toEqual(all);
  });

  it("is the same order when nothing moved", () => {
    expect(withVisibleOrder(all, ["a", "c", "e"])).toEqual(all);
  });

  it("ignores ids it doesn't know", () => {
    expect(withVisibleOrder(["a", "b"], ["zzz", "a"])).toEqual(["a", "b"]);
  });
});
