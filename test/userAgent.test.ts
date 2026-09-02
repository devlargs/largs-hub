import { describe, expect, it } from "vitest";
import {
  chromeMajorVersion,
  lowEntropyClientHints,
  spoofedUserAgent,
  withChromeIdentityHeaders,
} from "../electron/userAgent";

const VERSION = "140.0.7339.207";

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

describe("spoofedUserAgent", () => {
  it("looks like desktop Chrome and never names Electron", () => {
    const ua = spoofedUserAgent(VERSION);
    expect(ua).toContain(`Chrome/${VERSION} Safari/537.36`);
    expect(ua).not.toMatch(/electron/i);
  });
});

describe("lowEntropyClientHints", () => {
  it("brands as Google Chrome at the major version", () => {
    expect(lowEntropyClientHints(VERSION)["sec-ch-ua"]).toBe(
      '"Chromium";v="140", "Google Chrome";v="140", "Not=A?Brand";v="99"',
    );
  });
});

describe("withChromeIdentityHeaders", () => {
  it("replaces every trace of Electron — this is the #106 fix", () => {
    const out = withChromeIdentityHeaders(electronHeaders(), VERSION);
    expect(JSON.stringify(out)).not.toMatch(/electron/i);
    expect(out["User-Agent"]).toBe(spoofedUserAgent(VERSION));
    expect(out["sec-ch-ua"]).toBe(lowEntropyClientHints(VERSION)["sec-ch-ua"]);
  });

  it("keeps unrelated headers untouched", () => {
    expect(withChromeIdentityHeaders(electronHeaders(), VERSION).Accept).toBe("text/html");
  });

  it("does not send two copies when Chromium capitalises the hint names", () => {
    const out = withChromeIdentityHeaders(
      { "Sec-CH-UA": '"Electron";v="38"', "user-agent": "Electron" },
      VERSION,
    );
    const hintKeys = Object.keys(out).filter((k) => k.toLowerCase().startsWith("sec-ch-ua"));
    expect(hintKeys).toEqual(["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"]);
    expect(Object.keys(out).filter((k) => k.toLowerCase() === "user-agent")).toEqual(["User-Agent"]);
  });

  it("rewrites high-entropy hints only when the site asked for them", () => {
    const withFullList = withChromeIdentityHeaders(
      { ...electronHeaders(), "sec-ch-ua-full-version-list": '"Electron";v="38.0.0"' },
      VERSION,
    );
    expect(withFullList["sec-ch-ua-full-version-list"]).toContain(`"Google Chrome";v="${VERSION}"`);
    expect(withChromeIdentityHeaders(electronHeaders(), VERSION)).not.toHaveProperty(
      "sec-ch-ua-full-version-list",
    );
  });

  it("adds no hints to a request that carried none", () => {
    const out = withChromeIdentityHeaders({ Accept: "text/html" }, VERSION);
    expect(Object.keys(out).some((k) => k.toLowerCase().startsWith("sec-ch-ua"))).toBe(false);
    expect(out["User-Agent"]).toBe(spoofedUserAgent(VERSION));
  });
});
