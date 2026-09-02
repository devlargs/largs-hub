import { describe, expect, it } from "vitest";
import { compareServiceNames, sortByName } from "../src/lib/serviceOrder";

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
    ];
    expect(names(sortByName(presets))).toEqual([
      "Discord",
      "Gmail",
      "Google Chat",
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
    expect(sortByName([{ name: "Todo", type: "todo" }])).toEqual([{ name: "Todo", type: "todo" }]);
  });
});
