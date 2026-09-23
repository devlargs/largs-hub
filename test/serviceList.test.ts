import { describe, expect, it } from "vitest";
import { lastActiveServiceId, reorderServices, withAddedService } from "../electron/serviceList";
import type { Service } from "../electron/shared/types";

const service = (id: string, overrides: Partial<Service> = {}): Service => ({
  id,
  name: id.toUpperCase(),
  url: `https://${id}.example.com`,
  icon: "",
  color: "#888888",
  notificationCount: 0,
  ...overrides,
});

const a = service("a");
const b = service("b");
const c = service("c");

describe("withAddedService", () => {
  it("appends a new service without touching the original list", () => {
    const list = [a, b];
    expect(withAddedService(list, c)).toEqual([a, b, c]);
    expect(list).toEqual([a, b]);
  });

  it("refuses a duplicate id", () => {
    expect(withAddedService([a, b], service("a", { name: "Other" }))).toBeNull();
  });
});

describe("reorderServices", () => {
  it("follows the given order", () => {
    expect(reorderServices([a, b, c], ["c", "a", "b"])).toEqual([c, a, b]);
  });

  it("skips unknown ids and drops services that aren't listed", () => {
    expect(reorderServices([a, b, c], ["b", "zzz", "a"])).toEqual([b, a]);
  });
});

describe("lastActiveServiceId", () => {
  it("reopens a service that still exists and is enabled", () => {
    expect(lastActiveServiceId("b", [a, b])).toBe("b");
  });

  it("falls back to nothing for a removed or disabled service", () => {
    expect(lastActiveServiceId("zzz", [a, b])).toBeNull();
    expect(lastActiveServiceId("b", [a, service("b", { enabled: false })])).toBeNull();
  });

  it("ignores a stored value that isn't an id", () => {
    expect(lastActiveServiceId(undefined, [a])).toBeNull();
    expect(lastActiveServiceId(42, [a])).toBeNull();
  });
});
