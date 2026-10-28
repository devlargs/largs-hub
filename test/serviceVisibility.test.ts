import { describe, expect, it } from "vitest";
import {
  hiddenServices,
  isHiddenService,
  sidebarServices,
} from "../electron/shared/serviceVisibility";

const services = [
  { id: "a" },
  { id: "b", hidden: true },
  { id: "c", hidden: false },
  { id: "d", hidden: true },
];

describe("isHiddenService", () => {
  it("is true only for hidden: true", () => {
    expect(isHiddenService({ hidden: true })).toBe(true);
    expect(isHiddenService({ hidden: false })).toBe(false);
    expect(isHiddenService({})).toBe(false);
    expect(isHiddenService(undefined)).toBe(false);
  });
});

describe("sidebarServices / hiddenServices", () => {
  it("split the list in order", () => {
    expect(sidebarServices(services).map((s) => s.id)).toEqual(["a", "c"]);
    expect(hiddenServices(services).map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("handle an empty list", () => {
    expect(sidebarServices([])).toEqual([]);
    expect(hiddenServices([])).toEqual([]);
  });
});
