import { describe, expect, it } from "vitest";
import {
  decideRemoteLock,
  deviceDisplayName,
  platformLabel,
  sanitizeRemoteLockInfo,
} from "../electron/shared/remoteSession";

// Single active device (shared/remoteSession.ts): when another computer has
// the account's session, this one locks; never on cached data.

const NOW = 1_700_000_000_000;
const ME = "device-me";

describe("decideRemoteLock", () => {
  it("ignores cached snapshots, whatever they say", () => {
    expect(
      decideRemoteLock({
        session: { activeDeviceId: "other", activeDeviceName: "Mac" },
        myDeviceId: ME,
        fromCache: true,
        now: NOW,
      }),
    ).toEqual({ action: "ignore" });
  });

  it("unlocks when there is no session doc", () => {
    expect(decideRemoteLock({ session: null, myDeviceId: ME, fromCache: false, now: NOW })).toEqual(
      {
        action: "unlock",
      },
    );
  });

  it("unlocks when no computer holds the session", () => {
    expect(
      decideRemoteLock({
        session: { activeDeviceId: null },
        myDeviceId: ME,
        fromCache: false,
        now: NOW,
      }),
    ).toEqual({ action: "unlock" });
  });

  it("unlocks when this computer holds it", () => {
    expect(
      decideRemoteLock({
        session: { activeDeviceId: ME, activeDeviceName: "PC", activePlatform: "win32" },
        myDeviceId: ME,
        fromCache: false,
        now: NOW,
      }),
    ).toEqual({ action: "unlock" });
  });

  it("locks with the other computer's name and platform", () => {
    expect(
      decideRemoteLock({
        session: { activeDeviceId: "other", activeDeviceName: "Studio", activePlatform: "darwin" },
        myDeviceId: ME,
        fromCache: false,
        now: NOW,
      }),
    ).toEqual({
      action: "lock",
      info: { deviceName: "Studio", platform: "darwin", since: NOW },
    });
  });

  it("names an unnamed computer", () => {
    const decision = decideRemoteLock({
      session: { activeDeviceId: "other", activeDeviceName: "  " },
      myDeviceId: ME,
      fromCache: false,
      now: NOW,
    });
    expect(decision).toEqual({
      action: "lock",
      info: { deviceName: "another computer", platform: "", since: NOW },
    });
  });
});

describe("device names", () => {
  it("labels the platforms", () => {
    expect(platformLabel("win32")).toBe("Windows");
    expect(platformLabel("darwin")).toBe("macOS");
    expect(platformLabel("linux")).toBe("Linux");
    expect(platformLabel("aix")).toBe("");
  });

  it("puts the platform after the name", () => {
    expect(deviceDisplayName("DESKTOP-1", "win32")).toBe("DESKTOP-1 (Windows)");
    expect(deviceDisplayName("MacBook", "darwin")).toBe("MacBook (macOS)");
    expect(deviceDisplayName("box", "freebsd")).toBe("box");
  });
});

describe("sanitizeRemoteLockInfo", () => {
  it("accepts a well-formed lock", () => {
    expect(sanitizeRemoteLockInfo({ deviceName: "Mac", platform: "darwin", since: NOW })).toEqual({
      deviceName: "Mac",
      platform: "darwin",
      since: NOW,
    });
  });

  it("rejects anything else", () => {
    expect(sanitizeRemoteLockInfo(null)).toBeNull();
    expect(sanitizeRemoteLockInfo({ deviceName: 1, platform: "darwin", since: NOW })).toBeNull();
    expect(
      sanitizeRemoteLockInfo({ deviceName: "Mac", platform: "darwin", since: NaN }),
    ).toBeNull();
  });
});
