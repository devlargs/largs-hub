import { describe, expect, it } from "vitest";
import {
  isSafeServiceUrl,
  migrateLegacyServiceShape,
  sanitizeService,
} from "../electron/serviceSchema";
import { TASKS_URL } from "../electron/shared/types";

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
    const retired = sanitizeService({ id: "n", name: "Notes", type: "notion-notes" });
    expect(retired).toMatchObject({ type: "notion-notes", url: "" });
  });

  // The built-in Todo list (and the Pomodoro service before it) became the
  // tasks web app: stored services on those types turn into a web service.
  it("turns a stored built-in Todo service into the tasks web app", () => {
    const todo = sanitizeService({ id: "p", name: "Todo", type: "todo", url: "todo://internal" });
    expect(todo).toMatchObject({ id: "p", name: "Todo", url: TASKS_URL });
    expect(todo).not.toHaveProperty("type");
  });

  it("migrates a stored Pomodoro service onto the tasks web app", () => {
    const pomodoro = sanitizeService({
      id: "p",
      name: "Pomodoro",
      type: "pomodoro",
      icon: "pomodoro.svg",
    });
    expect(pomodoro).toMatchObject({ name: "Todo", icon: "todo.svg", url: TASKS_URL });
    expect(pomodoro).not.toHaveProperty("type");
  });

  it("keeps a renamed Pomodoro service's own name", () => {
    expect(
      sanitizeService({ id: "p", name: "My list", type: "pomodoro", icon: "custom:a.png" }),
    ).toMatchObject({ name: "My list", icon: "custom:a.png", url: TASKS_URL });
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

// The blank-pane bug: get-services returns the stored list untouched, so a
// service left on the old type never reaches a renderer that recognises it.
describe("migrateLegacyServiceShape", () => {
  it("folds a stored Pomodoro service onto the tasks web app", () => {
    const migrated = migrateLegacyServiceShape({
      id: "p",
      name: "Pomodoro",
      type: "pomodoro",
      icon: "pomodoro.svg",
    });
    expect(migrated).toMatchObject({ name: "Todo", icon: "todo.svg", url: TASKS_URL });
    expect(migrated).not.toHaveProperty("type");
  });

  it("folds a stored built-in Todo service onto the tasks web app", () => {
    const migrated = migrateLegacyServiceShape({
      id: "t",
      name: "Todo",
      type: "todo",
      icon: "todo.svg",
      url: "todo://internal",
    });
    expect(migrated).toMatchObject({ id: "t", name: "Todo", icon: "todo.svg", url: TASKS_URL });
    expect(migrated).not.toHaveProperty("type");
  });

  it("keeps a name and icon the user chose", () => {
    expect(
      migrateLegacyServiceShape({ id: "p", name: "My list", type: "todo", icon: "custom:a" }),
    ).toMatchObject({ name: "My list", icon: "custom:a", url: TASKS_URL });
  });

  it("carries every other field across untouched", () => {
    const migrated = migrateLegacyServiceShape({
      id: "p",
      name: "Pomodoro",
      type: "pomodoro",
      color: "#abcdef",
      muted: true,
      privacyMode: true,
      url: "pomodoro://internal",
    });
    expect(migrated).toMatchObject({
      id: "p",
      color: "#abcdef",
      muted: true,
      privacyMode: true,
    });
  });

  // The store only rewrites itself when something actually changed, and it
  // tells them apart by identity.
  it("returns the very same object when there is nothing to migrate", () => {
    for (const input of [
      { id: "a", name: "A", url: TASKS_URL },
      { id: "b", name: "B", url: "https://example.com" },
      { id: "c", name: "C", type: "notion-notes" },
      null,
      "nonsense",
      undefined,
    ]) {
      expect(migrateLegacyServiceShape(input)).toBe(input);
    }
  });
});
