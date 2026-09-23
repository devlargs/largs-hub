import { describe, expect, it } from "vitest";
import { showsUnreadBadge } from "../electron/shared/types";

describe("showsUnreadBadge", () => {
  it("shows the count for an enabled service with Notifications on", () => {
    expect(showsUnreadBadge({})).toBe(true);
    expect(showsUnreadBadge({ enabled: true, notificationsEnabled: true })).toBe(true);
  });

  it("hides it for a disabled service", () => {
    expect(showsUnreadBadge({ enabled: false })).toBe(false);
    expect(showsUnreadBadge({ enabled: false, notificationsEnabled: true })).toBe(false);
  });

  it("hides it when Notifications is off", () => {
    expect(showsUnreadBadge({ notificationsEnabled: false })).toBe(false);
  });

  it("hides it for a service that's gone", () => {
    expect(showsUnreadBadge(undefined)).toBe(false);
    expect(showsUnreadBadge(null)).toBe(false);
  });
});
