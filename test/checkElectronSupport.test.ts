import { describe, expect, it } from "vitest";
import { electronSupport } from "../scripts/check-electron-support.cjs";

describe("electronSupport", () => {
  it("is ok on the latest major and the one before it", () => {
    expect(electronSupport("44.4.5", "44.4.5").status).toBe("ok");
    expect(electronSupport("43.7.5", "44.4.5").status).toBe("ok");
  });

  it("flags the oldest of the three supported majors as the last", () => {
    expect(electronSupport("42.11.8", "44.4.5")).toEqual({
      status: "last",
      installedMajor: 42,
      oldestSupported: 42,
    });
  });

  it("is unsupported once three newer majors are out", () => {
    expect(electronSupport("35.7.5", "44.4.5").status).toBe("unsupported");
    expect(electronSupport("41.10.7", "44.4.5").status).toBe("unsupported");
  });

  it("throws on something that isn't a version", () => {
    expect(() => electronSupport("", "44.4.5")).toThrow();
  });
});
