import { describe, expect, it } from "vitest";
import { isPermissionAllowed } from "../electron/servicePermissions";
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

describe("isPermissionAllowed", () => {
  it("allows notifications while the service's Notifications switch is on", () => {
    expect(isPermissionAllowed(service(), "notifications")).toBe(true);
    expect(isPermissionAllowed(service({ notificationsEnabled: true }), "notifications")).toBe(
      true,
    );
  });

  it("refuses notifications once the switch is off", () => {
    expect(isPermissionAllowed(service({ notificationsEnabled: false }), "notifications")).toBe(
      false,
    );
  });

  it("leaves the other permissions alone when notifications are off", () => {
    const quiet = service({ notificationsEnabled: false });
    expect(isPermissionAllowed(quiet, "fullscreen")).toBe(true);
    expect(isPermissionAllowed(quiet, "clipboard-sanitized-write")).toBe(true);
  });

  it("gives camera and mic only to call services", () => {
    expect(isPermissionAllowed(service({ url: "https://www.messenger.com" }), "media")).toBe(true);
    expect(isPermissionAllowed(service({ url: "https://web.whatsapp.com" }), "media")).toBe(true);
    expect(isPermissionAllowed(service(), "media")).toBe(false);
    expect(isPermissionAllowed(service({ url: "not a url" }), "media")).toBe(false);
  });

  it("denies anything else, and everything for a service that's gone", () => {
    expect(isPermissionAllowed(service(), "geolocation")).toBe(false);
    expect(isPermissionAllowed(undefined, "notifications")).toBe(false);
  });
});
