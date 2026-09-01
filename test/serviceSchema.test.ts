import { describe, expect, it } from "vitest";
import { isSafeServiceUrl, sanitizeService } from "../electron/serviceSchema";

describe("isSafeServiceUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeServiceUrl("https://mail.google.com")).toBe(true);
    expect(isSafeServiceUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects schemes that could reach the local machine or execute", () => {
    expect(isSafeServiceUrl("file:///C:/Windows/System32/config/SAM")).toBe(false);
    expect(isSafeServiceUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeServiceUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeServiceUrl("custom-icon://../../secret")).toBe(false);
  });

  it("rejects a schemeless address — it isn't a URL yet", () => {
    expect(isSafeServiceUrl("mail.proton.me")).toBe(false);
  });

  it("rejects non-strings and unparseable input", () => {
    expect(isSafeServiceUrl(undefined)).toBe(false);
    expect(isSafeServiceUrl(null)).toBe(false);
    expect(isSafeServiceUrl(42)).toBe(false);
    expect(isSafeServiceUrl("")).toBe(false);
    expect(isSafeServiceUrl("http://")).toBe(false);
  });
});

describe("sanitizeService", () => {
  const valid = {
    id: "abc",
    name: "Gmail",
    url: "https://mail.google.com",
  };

  it("accepts a minimal service and fills the defaults", () => {
    expect(sanitizeService(valid)).toEqual({
      id: "abc",
      name: "Gmail",
      url: "https://mail.google.com",
      icon: "",
      color: "#888888",
      notificationCount: 0,
      muted: false,
      enabled: true,
      notificationsEnabled: true,
      blurWhenInactive: false,
      privacyMode: false,
    });
  });

  it("keeps the flags it was given", () => {
    const result = sanitizeService({
      ...valid,
      icon: "custom:x.png",
      color: "#ff0000",
      muted: true,
      enabled: false,
      notificationsEnabled: false,
      blurWhenInactive: true,
      privacyMode: true,
    });
    expect(result).toMatchObject({
      icon: "custom:x.png",
      color: "#ff0000",
      muted: true,
      enabled: false,
      notificationsEnabled: false,
      blurWhenInactive: true,
      privacyMode: true,
    });
  });

  it("always resets the notification count — it is runtime state, not stored", () => {
    expect(sanitizeService({ ...valid, notificationCount: 99 })?.notificationCount).toBe(0);
  });

  it("rejects a missing or blank id or name", () => {
    expect(sanitizeService({ ...valid, id: "" })).toBeNull();
    expect(sanitizeService({ ...valid, id: 5 })).toBeNull();
    expect(sanitizeService({ ...valid, name: "" })).toBeNull();
    expect(sanitizeService({ id: "a" })).toBeNull();
  });

  it("rejects anything that isn't an object", () => {
    expect(sanitizeService(null)).toBeNull();
    expect(sanitizeService(undefined)).toBeNull();
    expect(sanitizeService("service")).toBeNull();
    expect(sanitizeService(7)).toBeNull();
  });

  // This is the silent-discard path: a bad URL means the edit never lands.
  it("rejects a web service whose URL is unsafe or missing", () => {
    expect(sanitizeService({ ...valid, url: "file:///etc/passwd" })).toBeNull();
    expect(sanitizeService({ ...valid, url: "mail.proton.me" })).toBeNull();
    expect(sanitizeService({ id: "a", name: "A" })).toBeNull();
  });

  it("allows an internal service to have no URL at all", () => {
    const todo = sanitizeService({ id: "p", name: "Todo", type: "todo" });
    expect(todo).toMatchObject({ type: "todo", url: "" });
    const retired = sanitizeService({ id: "n", name: "Notes", type: "notion-notes" });
    expect(retired).toMatchObject({ type: "notion-notes" });
  });

  // Services stored before the Pomodoro service became a plain Todo list still
  // carry the old type, name and icon — they have to survive the rename.
  it("migrates a stored Pomodoro service onto the todo type", () => {
    expect(
      sanitizeService({ id: "p", name: "Pomodoro", type: "pomodoro", icon: "pomodoro.svg" }),
    ).toMatchObject({ type: "todo", name: "Todo", icon: "todo.svg" });
  });

  it("keeps a renamed Pomodoro service's own name", () => {
    expect(
      sanitizeService({ id: "p", name: "My list", type: "pomodoro", icon: "custom:a.png" }),
    ).toMatchObject({ type: "todo", name: "My list", icon: "custom:a.png" });
  });

  it("drops an unrecognised type rather than trusting it", () => {
    // Without a valid type the URL check applies again, so this survives only
    // because the URL is good — and comes back with no type field.
    const result = sanitizeService({ ...valid, type: "evil" });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("type");
  });

  it("rejects an unrecognised type with no usable URL", () => {
    expect(sanitizeService({ id: "a", name: "A", type: "evil" })).toBeNull();
  });

  it("coerces non-string icon and color to their defaults", () => {
    const result = sanitizeService({ ...valid, icon: 5, color: null });
    expect(result).toMatchObject({ icon: "", color: "#888888" });
  });
});
