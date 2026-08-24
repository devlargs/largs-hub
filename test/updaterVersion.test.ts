import { describe, expect, it } from "vitest";
import { isNewerVersion, parseVersion } from "../electron/updater";

describe("parseVersion", () => {
  it("parses with and without the v prefix", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v0.1.42")).toEqual([0, 1, 42]);
    expect(parseVersion("  v10.0.1 ")).toEqual([10, 0, 1]);
  });

  it("returns null for anything that isn't a plain three-part version", () => {
    expect(parseVersion("v0.1.42-rc1")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("1.2.3.4")).toBeNull();
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(42)).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("is true only when the candidate is strictly newer", () => {
    expect(isNewerVersion("0.1.43", "0.1.42")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.99")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  });

  it("is false for the same version", () => {
    expect(isNewerVersion("0.1.42", "0.1.42")).toBe(false);
    expect(isNewerVersion("v0.1.42", "0.1.42")).toBe(false);
  });

  it("never offers a downgrade — the #71 bug", () => {
    expect(isNewerVersion("0.1.41", "0.1.42")).toBe(false);
    expect(isNewerVersion("0.1.9", "0.1.10")).toBe(false); // string compare would say true
    expect(isNewerVersion("0.9.9", "1.0.0")).toBe(false);
  });

  it("compares numerically, not lexicographically", () => {
    expect(isNewerVersion("0.1.10", "0.1.9")).toBe(true);
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
  });

  it("refuses to act on a tag it cannot parse", () => {
    expect(isNewerVersion("v0.1.43-rc1", "0.1.42")).toBe(false);
    expect(isNewerVersion("", "0.1.42")).toBe(false);
    expect(isNewerVersion("0.1.43", "not-a-version")).toBe(false);
  });
});
