import { describe, expect, it } from "vitest";
import { serviceLabel } from "../src/lib/serviceLabel";
import type { Service } from "../electron/shared/types";

const service = (overrides: Partial<Service> = {}): Service => ({
  id: "a",
  name: "Gmail",
  url: "https://mail.google.com",
  icon: "",
  color: "#888888",
  notificationCount: 0,
  ...overrides,
});

describe("serviceLabel", () => {
  it("is just the name when there is nothing else to say", () => {
    expect(serviceLabel(service(), 0)).toBe("Gmail");
  });

  it("announces the unread count that is otherwise only a badge", () => {
    expect(serviceLabel(service(), 3)).toBe("Gmail, 3 unread");
    expect(serviceLabel(service(), 1)).toBe("Gmail, 1 unread");
  });

  it("announces a disabled service", () => {
    expect(serviceLabel(service({ enabled: false }), 0)).toBe("Gmail, disabled");
  });

  it("does not read a stale count for a disabled service", () => {
    expect(serviceLabel(service({ enabled: false }), 9)).toBe("Gmail, disabled");
  });

  it("treats an explicitly enabled service like the default", () => {
    expect(serviceLabel(service({ enabled: true }), 2)).toBe("Gmail, 2 unread");
  });

  it("ignores a negative count rather than reading it out", () => {
    expect(serviceLabel(service(), -1)).toBe("Gmail");
  });
});
