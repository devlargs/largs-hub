import { describe, expect, it } from "vitest";
import {
  trayServiceEntries,
  trayServiceLabel,
  trayTooltip,
  windowCloseAction,
  windowMinimizeAction,
} from "../electron/trayMenu";

const service = (id: string, name: string, enabled?: boolean) => ({ id, name, enabled });

describe("trayServiceEntries", () => {
  it("lists enabled services in order with their counts", () => {
    const entries = trayServiceEntries([service("a", "Gmail"), service("b", "Slack")], {
      a: 3,
      b: 0,
    });
    expect(entries).toEqual([
      { id: "a", name: "Gmail", unread: 3, enabled: true },
      { id: "b", name: "Slack", unread: 0, enabled: true },
    ]);
  });

  it("leaves disabled services out — the menu jumps to a service you can open", () => {
    const entries = trayServiceEntries([service("a", "Gmail", false), service("b", "Slack")], {});
    expect(entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("treats a missing count as zero", () => {
    expect(trayServiceEntries([service("a", "Gmail")], {})[0].unread).toBe(0);
  });

  it("never reports a negative count", () => {
    expect(trayServiceEntries([service("a", "Gmail")], { a: -5 })[0].unread).toBe(0);
  });

  it("handles an empty service list", () => {
    expect(trayServiceEntries([], {})).toEqual([]);
  });
});

describe("trayServiceLabel", () => {
  it("appends the count only when there is one", () => {
    expect(trayServiceLabel({ id: "a", name: "Gmail", unread: 3, enabled: true })).toBe(
      "Gmail (3)",
    );
    expect(trayServiceLabel({ id: "a", name: "Gmail", unread: 0, enabled: true })).toBe("Gmail");
  });
});

describe("trayTooltip", () => {
  it("is the bare app name with nothing unread", () => {
    expect(trayTooltip(0)).toBe("Largs Hub");
    expect(trayTooltip(-1)).toBe("Largs Hub");
  });

  it("carries the total when there is one", () => {
    expect(trayTooltip(7)).toBe("Largs Hub — 7 unread");
  });
});

describe("windowCloseAction", () => {
  // Both settings default off, so the app must keep quitting on close exactly
  // as it did before unless asked otherwise.
  it("quits when the setting is off", () => {
    expect(windowCloseAction(false, true)).toBe("quit");
  });

  it("hides when the setting is on and a tray exists", () => {
    expect(windowCloseAction(true, true)).toBe("hide");
  });

  // Hiding to a tray that failed to create would leave the app running with no
  // way to reach it.
  it("quits when the setting is on but there is no tray", () => {
    expect(windowCloseAction(true, false)).toBe("quit");
  });
});

describe("windowMinimizeAction", () => {
  it("follows the same rules as close", () => {
    expect(windowMinimizeAction(false, true)).toBe("quit");
    expect(windowMinimizeAction(true, true)).toBe("hide");
    expect(windowMinimizeAction(true, false)).toBe("quit");
  });
});
