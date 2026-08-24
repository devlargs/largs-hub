import { describe, expect, it } from "vitest";
import {
  applyServicePatch,
  nextBlurWhenInactive,
  nextEnabled,
  nextMuted,
  nextNotificationsEnabled,
  nextPrivacyMode,
} from "../electron/serviceFlags";
import type { Service } from "../electron/shared/types";

const service = (overrides: Partial<Service> = {}): Service => ({
  id: "a",
  name: "A",
  url: "https://a.test",
  icon: "",
  color: "#888888",
  notificationCount: 0,
  ...overrides,
});

const list = (): Service[] => [service(), service({ id: "b", name: "B" })];

describe("applyServicePatch", () => {
  it("merges the patch into the matching service only", () => {
    const updated = applyServicePatch(list(), "a", () => ({ muted: true }));
    expect(updated?.[0].muted).toBe(true);
    expect(updated?.[1].muted).toBeUndefined();
  });

  it("leaves the other fields of the patched service alone", () => {
    const updated = applyServicePatch(list(), "a", () => ({ muted: true }));
    expect(updated?.[0].name).toBe("A");
    expect(updated?.[0].url).toBe("https://a.test");
  });

  it("preserves order", () => {
    const updated = applyServicePatch(list(), "b", () => ({ muted: true }));
    expect(updated?.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the list it was given", () => {
    const original = list();
    applyServicePatch(original, "a", () => ({ muted: true }));
    expect(original[0].muted).toBeUndefined();
  });

  it("returns null when the service is gone", () => {
    expect(applyServicePatch(list(), "missing", () => ({ muted: true }))).toBeNull();
    expect(applyServicePatch([], "a", () => ({ muted: true }))).toBeNull();
  });

  it("hands the patch the current service, not a stale copy", () => {
    // The bug this guards: a native menu opens while muted is false, the
    // service is muted elsewhere, then the menu item fires. It must toggle from
    // the value in the list, not the one the menu captured.
    const current = [service({ muted: true })];
    const updated = applyServicePatch(current, "a", nextMuted);
    expect(updated?.[0].muted).toBe(false);
  });
});

describe("flag toggles", () => {
  it("treats a missing enabled as enabled, so the first toggle disables", () => {
    expect(nextEnabled(service())).toEqual({ enabled: false });
    expect(nextEnabled(service({ enabled: true }))).toEqual({ enabled: false });
    expect(nextEnabled(service({ enabled: false }))).toEqual({ enabled: true });
  });

  it("treats a missing notificationsEnabled as on", () => {
    expect(nextNotificationsEnabled(service())).toEqual({ notificationsEnabled: false });
    expect(nextNotificationsEnabled(service({ notificationsEnabled: false }))).toEqual({
      notificationsEnabled: true,
    });
  });

  it("treats the opt-in flags as off when missing", () => {
    expect(nextMuted(service())).toEqual({ muted: true });
    expect(nextBlurWhenInactive(service())).toEqual({ blurWhenInactive: true });
    expect(nextPrivacyMode(service())).toEqual({ privacyMode: true });
  });

  it("round-trips: toggling twice restores the original value", () => {
    const cases = [
      [nextMuted, "muted"],
      [nextEnabled, "enabled"],
      [nextPrivacyMode, "privacyMode"],
      [nextBlurWhenInactive, "blurWhenInactive"],
      [nextNotificationsEnabled, "notificationsEnabled"],
    ] as const;
    for (const [toggle, field] of cases) {
      // Start from an explicit value so "missing" defaulting isn't in play.
      const start = service({ [field]: true });
      const once = { ...start, ...toggle(start) };
      const twice = { ...once, ...toggle(once) };
      expect(once[field]).toBe(false);
      expect(twice[field]).toBe(true);
    }
  });

  it("returns only the field it owns", () => {
    expect(Object.keys(nextMuted(service()))).toEqual(["muted"]);
    expect(Object.keys(nextEnabled(service()))).toEqual(["enabled"]);
  });
});
