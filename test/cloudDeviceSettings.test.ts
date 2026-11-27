import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fromHomeRelative,
  sanitizeCloudCredential,
  sanitizeHomeRelative,
  sanitizeWindowSize,
  toHomeRelative,
} from "../electron/cloudDeviceSettings";

describe("toHomeRelative / fromHomeRelative", () => {
  it("maps a folder under the home folder both ways on Windows", () => {
    const rel = toHomeRelative("C:\\Users\\me\\Downloads\\Hub", "C:\\Users\\me", path.win32);
    expect(rel).toBe("Downloads/Hub");
    expect(fromHomeRelative(rel!, "C:\\Users\\other", path.win32)).toBe(
      "C:\\Users\\other\\Downloads\\Hub",
    );
  });

  it("maps a folder under the home folder both ways on macOS", () => {
    const rel = toHomeRelative("/Users/me/Downloads/Hub", "/Users/me", path.posix);
    expect(rel).toBe("Downloads/Hub");
    expect(fromHomeRelative(rel!, "/Users/you", path.posix)).toBe("/Users/you/Downloads/Hub");
  });

  it("keeps the system default and leaves other folders unsynced", () => {
    expect(toHomeRelative("", "/Users/me", path.posix)).toBe("");
    expect(toHomeRelative("/Volumes/USB", "/Users/me", path.posix)).toBeNull();
    expect(toHomeRelative("/Users/me", "/Users/me", path.posix)).toBeNull();
    expect(toHomeRelative("D:\\Downloads", "C:\\Users\\me", path.win32)).toBeNull();
  });
});

describe("sanitizeHomeRelative", () => {
  it("accepts plain folders under home", () => {
    expect(sanitizeHomeRelative("Downloads")).toBe("Downloads");
    expect(sanitizeHomeRelative("Documents/My Files")).toBe("Documents/My Files");
    expect(sanitizeHomeRelative("")).toBe("");
  });

  it("refuses anything that could escape or reach somewhere sensitive", () => {
    for (const bad of [
      null,
      5,
      "..",
      "a/../b",
      "/etc",
      "C:/Windows",
      "a\\b",
      ".config",
      "appdata/Roaming",
      "Library",
      " Downloads",
      "x".repeat(500),
    ]) {
      expect(sanitizeHomeRelative(bad)).toBeNull();
    }
  });
});

describe("sanitizeWindowSize", () => {
  it("keeps sizes within the window's limits", () => {
    expect(sanitizeWindowSize({ width: 1400.4, height: 900 })).toEqual({
      width: 1400,
      height: 900,
    });
    expect(sanitizeWindowSize({ width: 10, height: 1e9 })).toEqual({ width: 480, height: 16384 });
    expect(sanitizeWindowSize(null)).toEqual({ width: 1200, height: 800 });
  });
});

describe("sanitizeCloudCredential", () => {
  const credential = {
    algorithm: "scrypt",
    salt: "ab",
    hash: "cd",
    keyLength: 64,
    cost: 16384,
    blockSize: 8,
    parallelization: 1,
  };

  it("accepts the app's own parameters", () => {
    expect(sanitizeCloudCredential(credential)).toEqual(credential);
  });

  it("refuses costs that would make unlocking hang", () => {
    expect(sanitizeCloudCredential({ ...credential, cost: 1 << 20 })).toBeNull();
    expect(sanitizeCloudCredential({ ...credential, blockSize: 64 })).toBeNull();
    expect(sanitizeCloudCredential({ ...credential, parallelization: 16 })).toBeNull();
    expect(sanitizeCloudCredential({ hash: "x" })).toBeNull();
  });
});
