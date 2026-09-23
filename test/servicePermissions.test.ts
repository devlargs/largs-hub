import { describe, expect, it } from "vitest";
import {
  isMediaAllowed,
  isPermissionAllowed,
  isServiceOrigin,
} from "../electron/servicePermissions";
import type { Service } from "../electron/shared/types";

const service = (overrides: Partial<Service> = {}): Service => ({
  id: "a",
  name: "A",
  url: "https://mail.example.com",
  icon: "",
  color: "#888888",
  notificationCount: 0,
  ...overrides,
});

const SELF = "https://mail.example.com/inbox";

describe("isPermissionAllowed", () => {
  it("allows notifications while the service's Notifications switch is on", () => {
    expect(isPermissionAllowed(service(), "notifications", SELF)).toBe(true);
    expect(
      isPermissionAllowed(service({ notificationsEnabled: true }), "notifications", SELF),
    ).toBe(true);
  });

  it("refuses notifications once the switch is off", () => {
    expect(
      isPermissionAllowed(service({ notificationsEnabled: false }), "notifications", SELF),
    ).toBe(false);
  });

  it("leaves the other permissions alone when notifications are off", () => {
    const quiet = service({ notificationsEnabled: false });
    expect(isPermissionAllowed(quiet, "fullscreen", SELF)).toBe(true);
    expect(isPermissionAllowed(quiet, "clipboard-sanitized-write", SELF)).toBe(true);
  });

  it("denies anything else, and everything for a service that's gone", () => {
    expect(isPermissionAllowed(service(), "geolocation", SELF)).toBe(false);
    expect(isPermissionAllowed(undefined, "notifications", SELF)).toBe(false);
  });
});

describe("camera and mic", () => {
  const messenger = service({ url: "https://www.messenger.com" });

  it("grants a call service asking from its own domain", () => {
    expect(isPermissionAllowed(messenger, "media", "https://www.messenger.com/t/123")).toBe(true);
    expect(isPermissionAllowed(messenger, "media", "https://messenger.com")).toBe(true);
    const whatsapp = service({ url: "https://web.whatsapp.com" });
    expect(isPermissionAllowed(whatsapp, "media", "https://web.whatsapp.com/")).toBe(true);
  });

  it("grants a call service asking from its preset's call domains", () => {
    expect(isPermissionAllowed(messenger, "media", "https://www.facebook.com/groupcall/x")).toBe(
      true,
    );
    const gmail = service({ url: "https://mail.google.com/mail/u/0" });
    expect(isPermissionAllowed(gmail, "media", "https://meet.google.com/abc-defg-hij")).toBe(true);
  });

  it("refuses allowlisted auth and CDN domains shown inside the view", () => {
    for (const url of [
      "https://accounts.google.com/signin",
      "https://github.com/login",
      "https://x.com/home",
      "https://www.reddit.com",
      "https://discord.com/app",
    ]) {
      expect(isPermissionAllowed(messenger, "media", url)).toBe(false);
    }
  });

  it("refuses a third-party iframe inside the service page", () => {
    expect(isPermissionAllowed(messenger, "media", "https://ads.example.net/frame")).toBe(false);
  });

  it("refuses look-alike hosts", () => {
    expect(isPermissionAllowed(messenger, "media", "https://evilmessenger.com")).toBe(false);
    expect(isPermissionAllowed(messenger, "media", "https://messenger.com.evil.io")).toBe(false);
  });

  it("refuses a missing or malformed requesting URL", () => {
    expect(isPermissionAllowed(messenger, "media", "")).toBe(false);
    expect(isPermissionAllowed(messenger, "media", "not a url")).toBe(false);
  });

  it("refuses everything once the service's switch is off", () => {
    const off = service({ url: "https://www.messenger.com", mediaAllowed: false });
    expect(isPermissionAllowed(off, "media", "https://www.messenger.com/t/1")).toBe(false);
  });

  it("grants a custom service its own origin once the switch is turned on", () => {
    const custom = service({ url: "https://meet.example.org", mediaAllowed: true });
    expect(isPermissionAllowed(custom, "media", "https://meet.example.org/room")).toBe(true);
    expect(isPermissionAllowed(custom, "media", "https://accounts.google.com")).toBe(false);
  });
});

describe("isMediaAllowed", () => {
  it("defaults on for services with calls", () => {
    for (const url of [
      "https://www.messenger.com",
      "https://www.facebook.com/messages",
      "https://web.whatsapp.com",
      "https://app.slack.com/client/T1",
      "https://myteam.slack.com",
      "https://discord.com/channels/@me",
      "https://web.telegram.org/k/",
      "https://mail.google.com/mail/u/0",
      "https://chat.google.com",
    ]) {
      expect(isMediaAllowed({ url }), url).toBe(true);
    }
  });

  it("defaults off for everything else, including custom services", () => {
    for (const url of [
      "https://mail.example.com",
      "https://calendar.google.com",
      "https://www.notion.so",
      "https://github.com",
      "not a url",
    ]) {
      expect(isMediaAllowed({ url }), url).toBe(false);
    }
  });

  it("follows the switch once it's set, either way", () => {
    expect(isMediaAllowed({ url: "https://www.messenger.com", mediaAllowed: false })).toBe(false);
    expect(isMediaAllowed({ url: "https://mail.example.com", mediaAllowed: true })).toBe(true);
  });
});

describe("isServiceOrigin", () => {
  it("accepts subdomains and parent domains of the service host", () => {
    expect(isServiceOrigin("https://example.com", "https://app.example.com")).toBe(true);
    expect(isServiceOrigin("https://app.example.com", "https://example.com")).toBe(true);
  });

  it("accepts an origin string without a path", () => {
    expect(isServiceOrigin("https://app.slack.com", "https://app.slack.com")).toBe(true);
  });

  it("doesn't widen a non-call service to other domains", () => {
    expect(isServiceOrigin("https://calendar.google.com", "https://meet.google.com")).toBe(false);
  });
});
