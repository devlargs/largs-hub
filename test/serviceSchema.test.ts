import { describe, expect, it } from "vitest";
import {
  isSafeServiceUrl,
  migrateLegacyServiceShape,
  sanitizeService,
} from "../electron/serviceSchema";
import { isTasksService, TASKS_URL } from "../electron/shared/types";

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

  it("keeps set Camera and Microphone switches and leaves unset ones unset", () => {
    const set = sanitizeService({ ...valid, cameraAllowed: false, microphoneAllowed: true });
    expect(set).toMatchObject({ cameraAllowed: false, microphoneAllowed: true });
    // Unset (or junk) follows the default in isDeviceAllowed, so it isn't stored.
    expect(sanitizeService(valid)).not.toHaveProperty("cameraAllowed");
    expect(sanitizeService(valid)).not.toHaveProperty("microphoneAllowed");
    expect(sanitizeService({ ...valid, cameraAllowed: "yes" })).not.toHaveProperty("cameraAllowed");
  });

  it("carries the old Camera & microphone switch over to both new ones", () => {
    const off = sanitizeService({ ...valid, mediaAllowed: false });
    expect(off).toMatchObject({ cameraAllowed: false, microphoneAllowed: false });
    expect(off).not.toHaveProperty("mediaAllowed");
    const on = sanitizeService({ ...valid, mediaAllowed: true });
    expect(on).toMatchObject({ cameraAllowed: true, microphoneAllowed: true });
  });

  it("splits the old switch in the launch-time migration too", () => {
    const stored = { ...valid, mediaAllowed: false };
    const migrated = migrateLegacyServiceShape(stored);
    expect(migrated).toMatchObject({ cameraAllowed: false, microphoneAllowed: false });
    expect(migrated).not.toHaveProperty("mediaAllowed");
    // Nothing to fold in: the same object back, so the store isn't rewritten.
    expect(migrateLegacyServiceShape(valid)).toBe(valid);
  });

  it("prefers a new switch over the old one it replaced", () => {
    const service = sanitizeService({ ...valid, mediaAllowed: true, cameraAllowed: false });
    expect(service).toMatchObject({ cameraAllowed: false, microphoneAllowed: true });
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

  // Sound, Notifications, Blur and Privacy mode are the exception — see the
  // "Todo service flags" tests below.
  it("carries every other field across untouched", () => {
    const migrated = migrateLegacyServiceShape({
      id: "p",
      name: "Pomodoro",
      type: "pomodoro",
      color: "#abcdef",
      enabled: false,
      url: "pomodoro://internal",
    });
    expect(migrated).toMatchObject({
      id: "p",
      color: "#abcdef",
      enabled: false,
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

describe("isTasksService", () => {
  it("recognises the tasks web app by its host, whatever the path", () => {
    expect(isTasksService({ url: TASKS_URL })).toBe(true);
    expect(isTasksService({ url: `${TASKS_URL}/login` })).toBe(true);
  });

  it("does not match other services or lookalike hosts", () => {
    expect(isTasksService({ url: "https://mail.google.com" })).toBe(false);
    expect(isTasksService({ url: "https://ralphlargo.com" })).toBe(false);
    expect(isTasksService({ url: "https://tasks.ralphlargo.com.evil.com" })).toBe(false);
  });

  it("is false for a missing or unparseable URL", () => {
    expect(isTasksService({ url: "" })).toBe(false);
    expect(isTasksService({ url: "not a url" })).toBe(false);
    expect(isTasksService(null)).toBe(false);
    expect(isTasksService(undefined)).toBe(false);
  });
});

// The Todo service's menu has no Sound, Notifications, Blur when inactive,
// Privacy mode, Microphone or Camera switch, so none of them may be left on
// for it.
describe("Todo service flags", () => {
  const flagsOn = {
    muted: true,
    notificationsEnabled: false,
    blurWhenInactive: true,
    privacyMode: true,
    cameraAllowed: true,
    microphoneAllowed: true,
  };

  it("resets them on a stored tasks web service", () => {
    const migrated = migrateLegacyServiceShape({
      id: "t",
      name: "Todo",
      url: TASKS_URL,
      ...flagsOn,
    });
    const service = sanitizeService(migrated);
    expect(service).toMatchObject({
      muted: false,
      notificationsEnabled: true,
      blurWhenInactive: false,
      privacyMode: false,
    });
    expect(service).not.toHaveProperty("cameraAllowed");
    expect(service).not.toHaveProperty("microphoneAllowed");
  });

  it("resets them while folding a built-in Todo service over", () => {
    const service = sanitizeService({ id: "t", name: "Todo", type: "todo", ...flagsOn });
    expect(service).toMatchObject({
      url: TASKS_URL,
      muted: false,
      notificationsEnabled: true,
      blurWhenInactive: false,
      privacyMode: false,
    });
  });

  it("leaves the same flags alone on any other service", () => {
    const input = { id: "g", name: "Gmail", url: "https://mail.google.com", ...flagsOn };
    expect(migrateLegacyServiceShape(input)).toBe(input);
  });

  it("returns the same object when a tasks service's flags are already off", () => {
    const input = { id: "t", name: "Todo", url: TASKS_URL, muted: false, privacyMode: false };
    expect(migrateLegacyServiceShape(input)).toBe(input);
  });
});
