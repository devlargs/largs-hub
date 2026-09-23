import { describe, expect, it } from "vitest";
import {
  ChromeIdentity,
  HostPlatform,
  chromeIdentity,
  chromeMajorVersion,
  detectHostPlatform,
  macOsVersion,
  windowsPlatformVersion,
  withChromeIdentityHeaders,
} from "../electron/userAgent";

const VERSION = "140.0.7339.207";

const WINDOWS: HostPlatform = {
  os: "windows",
  platformVersion: "15.0.0",
  arch: "x86",
  bitness: "64",
};
const MAC_ARM: HostPlatform = {
  os: "macos",
  platformVersion: "15.1.0",
  arch: "arm",
  bitness: "64",
};
const MAC_INTEL: HostPlatform = {
  os: "macos",
  platformVersion: "14.6.0",
  arch: "x86",
  bitness: "64",
};

const windows = chromeIdentity(VERSION, WINDOWS);
const macArm = chromeIdentity(VERSION, MAC_ARM);

// What Electron actually puts on the wire, and what Google's sign-in rejects.
const electronHeaders = () => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) largs-hub/0.1.52 Electron/38.0.0",
  "sec-ch-ua": '"Chromium";v="140", "Electron";v="38", "Not=A?Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  Accept: "text/html",
});

describe("chromeMajorVersion", () => {
  it("takes the leading version component", () => {
    expect(chromeMajorVersion(VERSION)).toBe("140");
    expect(chromeMajorVersion("9")).toBe("9");
  });

  it("falls back rather than emitting undefined", () => {
    expect(chromeMajorVersion("")).toBe("0");
    expect(chromeMajorVersion("beta")).toBe("0");
  });
});

describe("detectHostPlatform", () => {
  it("reads Windows 11 on x64", () => {
    expect(detectHostPlatform("win32", "10.0.22631", "x64")).toEqual(WINDOWS);
  });

  it("reads an Apple Silicon Mac", () => {
    expect(detectHostPlatform("darwin", "24.1.0", "arm64")).toEqual(MAC_ARM);
  });

  it("reads an Intel Mac", () => {
    expect(detectHostPlatform("darwin", "23.6.0", "x64")).toEqual(MAC_INTEL);
  });

  it("reads Windows on ARM and 32-bit builds", () => {
    expect(detectHostPlatform("win32", "10.0.26100", "arm64")).toMatchObject({
      arch: "arm",
      bitness: "64",
      platformVersion: "19.0.0",
    });
    expect(detectHostPlatform("win32", "10.0.19045", "ia32")).toMatchObject({
      arch: "x86",
      bitness: "32",
    });
  });

  it("reads Linux", () => {
    expect(detectHostPlatform("linux", "6.8.0-45-generic", "x64")).toEqual({
      os: "linux",
      platformVersion: "6.8.0",
      arch: "x86",
      bitness: "64",
    });
  });
});

describe("macOsVersion", () => {
  it("maps Darwin 20–24 to macOS 11–15", () => {
    expect(macOsVersion("20.6.0")).toBe("11.6.0");
    expect(macOsVersion("22.4.0")).toBe("13.4.0");
    expect(macOsVersion("24.1.0")).toBe("15.1.0");
  });

  it("follows Apple's jump to macOS 26 at Darwin 25", () => {
    expect(macOsVersion("25.0.0")).toBe("26.0.0");
    expect(macOsVersion("25.2.0")).toBe("26.2.0");
  });

  it("falls back to Chrome's frozen 10.15.7 for old or unreadable releases", () => {
    expect(macOsVersion("19.6.0")).toBe("10.15.7");
    expect(macOsVersion("")).toBe("10.15.7");
  });
});

describe("windowsPlatformVersion", () => {
  it("reports what Chrome reports per Windows build", () => {
    expect(windowsPlatformVersion("10.0.19045")).toBe("10.0.0");
    expect(windowsPlatformVersion("10.0.22000")).toBe("14.0.0");
    expect(windowsPlatformVersion("10.0.22631")).toBe("15.0.0");
    expect(windowsPlatformVersion("10.0.26100")).toBe("19.0.0");
    expect(windowsPlatformVersion("garbage")).toBe("10.0.0");
  });
});

describe("chromeIdentity", () => {
  it("claims Windows Chrome on Windows", () => {
    expect(windows.userAgent).toBe(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${VERSION} Safari/537.36`,
    );
    expect(windows.navigatorPlatform).toBe("Win32");
    expect(windows.lowEntropyHints["sec-ch-ua-platform"]).toBe('"Windows"');
    expect(windows.metadata.platform).toBe("Windows");
  });

  it("claims Mac Chrome on a Mac, with the frozen Intel token even on Apple Silicon", () => {
    expect(macArm.userAgent).toBe(
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${VERSION} Safari/537.36`,
    );
    expect(macArm.navigatorPlatform).toBe("MacIntel");
    expect(macArm.lowEntropyHints["sec-ch-ua-platform"]).toBe('"macOS"');
    expect(macArm.highEntropyHints["sec-ch-ua-arch"]).toBe('"arm"');
    expect(macArm.highEntropyHints["sec-ch-ua-platform-version"]).toBe('"15.1.0"');
    expect(macArm.metadata).toMatchObject({
      platform: "macOS",
      platformVersion: "15.1.0",
      architecture: "arm",
    });
  });

  it("brands as Google Chrome at the major version", () => {
    expect(windows.lowEntropyHints["sec-ch-ua"]).toBe(
      '"Chromium";v="140", "Google Chrome";v="140", "Not=A?Brand";v="99"',
    );
  });

  // The #113 check: the headers and what the page reads from
  // navigator.userAgentData must tell the same story, on every platform.
  describe.each([
    ["Windows", WINDOWS],
    ["macOS (Apple Silicon)", MAC_ARM],
    ["macOS (Intel)", MAC_INTEL],
  ] as const)("on %s", (_name, host) => {
    const identity: ChromeIdentity = chromeIdentity(VERSION, host);
    const { metadata, lowEntropyHints: low, highEntropyHints: high } = identity;
    const asHeader = (brands: { brand: string; version: string }[]) =>
      brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");

    it("never names Electron anywhere", () => {
      expect(JSON.stringify(identity)).not.toMatch(/electron/i);
    });

    it("sends header hints that match the page-visible metadata", () => {
      expect(low["sec-ch-ua"]).toBe(asHeader(metadata.brands));
      expect(high["sec-ch-ua-full-version-list"]).toBe(asHeader(metadata.fullVersionList));
      expect(low["sec-ch-ua-platform"]).toBe(`"${metadata.platform}"`);
      expect(high["sec-ch-ua-platform-version"]).toBe(`"${metadata.platformVersion}"`);
      expect(high["sec-ch-ua-arch"]).toBe(`"${metadata.architecture}"`);
      expect(high["sec-ch-ua-bitness"]).toBe(`"${metadata.bitness}"`);
      expect(high["sec-ch-ua-full-version"]).toBe(`"${metadata.fullVersion}"`);
      expect(low["sec-ch-ua-mobile"]).toBe(metadata.mobile ? "?1" : "?0");
    });

    it("puts the same Chrome version in the UA string and the brands", () => {
      expect(identity.userAgent).toContain(`Chrome/${metadata.fullVersion} `);
      expect(metadata.brands.find((b) => b.brand === "Google Chrome")?.version).toBe("140");
    });

    it("names the same OS in the UA string, the hints and navigator.platform", () => {
      const osToken = { Windows: "Windows NT", macOS: "Macintosh" }[metadata.platform];
      const navigatorPlatform = { Windows: "Win32", macOS: "MacIntel" }[metadata.platform];
      expect(identity.userAgent).toContain(osToken);
      expect(identity.navigatorPlatform).toBe(navigatorPlatform);
    });
  });
});

describe("withChromeIdentityHeaders", () => {
  it("replaces every trace of Electron — this is the #106 fix", () => {
    const out = withChromeIdentityHeaders(electronHeaders(), windows);
    expect(JSON.stringify(out)).not.toMatch(/electron/i);
    expect(out["User-Agent"]).toBe(windows.userAgent);
    expect(out["sec-ch-ua"]).toBe(windows.lowEntropyHints["sec-ch-ua"]);
  });

  it("claims macOS on a Mac even when Electron sent Windows", () => {
    const out = withChromeIdentityHeaders(electronHeaders(), macArm);
    expect(out["sec-ch-ua-platform"]).toBe('"macOS"');
    expect(out["User-Agent"]).toBe(macArm.userAgent);
  });

  it("keeps unrelated headers untouched", () => {
    expect(withChromeIdentityHeaders(electronHeaders(), windows).Accept).toBe("text/html");
  });

  it("does not send two copies when Chromium capitalises the hint names", () => {
    const out = withChromeIdentityHeaders(
      { "Sec-CH-UA": '"Electron";v="38"', "user-agent": "Electron" },
      windows,
    );
    const hintKeys = Object.keys(out).filter((k) => k.toLowerCase().startsWith("sec-ch-ua"));
    expect(hintKeys).toEqual(["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"]);
    expect(Object.keys(out).filter((k) => k.toLowerCase() === "user-agent")).toEqual([
      "User-Agent",
    ]);
  });

  it("rewrites high-entropy hints only when the site asked for them", () => {
    const withFullList = withChromeIdentityHeaders(
      {
        ...electronHeaders(),
        "sec-ch-ua-full-version-list": '"Electron";v="38.0.0"',
        "sec-ch-ua-arch": '"x86"',
      },
      macArm,
    );
    expect(withFullList["sec-ch-ua-full-version-list"]).toContain(`"Google Chrome";v="${VERSION}"`);
    expect(withFullList["sec-ch-ua-arch"]).toBe('"arm"');
    expect(withChromeIdentityHeaders(electronHeaders(), windows)).not.toHaveProperty(
      "sec-ch-ua-full-version-list",
    );
  });

  it("adds no hints to a request that carried none", () => {
    const out = withChromeIdentityHeaders({ Accept: "text/html" }, windows);
    expect(Object.keys(out).some((k) => k.toLowerCase().startsWith("sec-ch-ua"))).toBe(false);
    expect(out["User-Agent"]).toBe(windows.userAgent);
  });
});
