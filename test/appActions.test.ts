import { describe, expect, it } from "vitest";
import {
  ShortcutKey,
  appShortcutFor,
  confirmPromptFor,
  isMessengerService,
} from "../src/lib/appActions";
import type { Service } from "../electron/shared/types";

const service = (url: string): Service => ({
  id: "a",
  name: "A",
  url,
  icon: "",
  color: "#888888",
  notificationCount: 0,
});

const ctrl = (key: string, extra: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key,
  ctrlKey: true,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...extra,
});

describe("isMessengerService", () => {
  it("goes by the hostname", () => {
    expect(isMessengerService(service("https://www.messenger.com"))).toBe(true);
    expect(isMessengerService(service("https://mail.google.com/messenger"))).toBe(false);
  });

  it("is false for no service or a broken URL", () => {
    expect(isMessengerService(null)).toBe(false);
    expect(isMessengerService(service("not a url"))).toBe(false);
  });
});

describe("appShortcutFor", () => {
  it("maps the zoom keys, with or without shift", () => {
    expect(appShortcutFor(ctrl("="))).toEqual({ kind: "zoom", direction: "in" });
    expect(appShortcutFor(ctrl("+", { shiftKey: true }))).toEqual({
      kind: "zoom",
      direction: "in",
    });
    expect(appShortcutFor(ctrl("-"))).toEqual({ kind: "zoom", direction: "out" });
    expect(appShortcutFor(ctrl("0"))).toEqual({ kind: "zoom", direction: "reset" });
  });

  it("maps Ctrl+F in either case, but not with shift", () => {
    expect(appShortcutFor(ctrl("f"))).toEqual({ kind: "find" });
    expect(appShortcutFor(ctrl("F"))).toEqual({ kind: "find" });
    expect(appShortcutFor(ctrl("f", { shiftKey: true }))).toBeNull();
  });

  it("maps Ctrl+1-9 to a zero-based sidebar position", () => {
    expect(appShortcutFor(ctrl("1"))).toEqual({ kind: "switch", index: 0 });
    expect(appShortcutFor(ctrl("9"))).toEqual({ kind: "switch", index: 8 });
  });

  it("ignores everything else", () => {
    expect(appShortcutFor(ctrl("a"))).toBeNull();
    expect(appShortcutFor(ctrl("1", { shiftKey: true }))).toBeNull();
    expect(appShortcutFor(ctrl("1", { altKey: true }))).toBeNull();
    expect(appShortcutFor(ctrl("1", { metaKey: true }))).toBeNull();
    expect(appShortcutFor(ctrl("1", { ctrlKey: false }))).toBeNull();
  });
});

describe("confirmPromptFor", () => {
  it("names the service in each destructive prompt", () => {
    expect(confirmPromptFor("confirm-remove-service", "Slack")).toMatchObject({
      title: "Remove Slack?",
      confirmLabel: "Remove",
    });
    expect(confirmPromptFor("confirm-disable-service", "Slack")).toMatchObject({
      title: "Disable Slack?",
      confirmLabel: "Disable",
    });
    expect(confirmPromptFor("confirm-clear-data", "Slack")).toMatchObject({
      title: "Clear Slack's data?",
      confirmLabel: "Clear data",
    });
  });

  it("has nothing to ask for other actions", () => {
    expect(confirmPromptFor("edit-service", "Slack")).toBeNull();
  });
});
