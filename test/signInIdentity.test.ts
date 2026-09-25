import { describe, expect, it } from "vitest";
import {
  firefoxVersion,
  isSignInUrl,
  requestUsesSignInIdentity,
  signInIdentity,
  withSignInHeaders,
} from "../electron/signInIdentity";

describe("isSignInUrl", () => {
  it("matches Google's sign-in host over https", () => {
    expect(isSignInUrl("https://accounts.google.com/v3/signin/identifier?flow=x")).toBe(true);
    expect(isSignInUrl("https://ACCOUNTS.google.com/")).toBe(true);
  });

  it("leaves everything else alone", () => {
    for (const url of [
      "https://mail.google.com/mail/u/0/",
      "https://chat.google.com/",
      "https://accounts.google.com.evil.test/",
      "https://evil.test/?next=https://accounts.google.com",
      "http://accounts.google.com/",
      "not a url",
      "",
      null,
      undefined,
    ]) {
      expect(isSignInUrl(url), String(url)).toBe(false);
    }
  });
});

describe("firefoxVersion", () => {
  it("claims the release before the cadence's latest", () => {
    // 143 shipped 2025-09-16, 144 four weeks later
    expect(firefoxVersion(new Date("2025-10-14T12:00:00Z"))).toBe(143);
    expect(firefoxVersion(new Date("2025-11-11T12:00:00Z"))).toBe(144);
    expect(firefoxVersion(new Date("2026-09-26T00:00:00Z"))).toBe(155);
  });

  it("never goes below the anchor release", () => {
    expect(firefoxVersion(new Date("2025-01-01T00:00:00Z"))).toBe(143);
  });
});

describe("signInIdentity", () => {
  it("is desktop Firefox for the host OS", () => {
    expect(signInIdentity("windows", 150)).toEqual({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
      navigatorPlatform: "Win32",
    });
    expect(signInIdentity("macos", 150)).toEqual({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0",
      navigatorPlatform: "MacIntel",
    });
  });

  it("names neither Chrome nor Electron", () => {
    for (const os of ["windows", "macos", "linux"] as const) {
      expect(signInIdentity(os, 150).userAgent).not.toMatch(/Chrome|Electron|AppleWebKit/);
    }
  });
});

describe("requestUsesSignInIdentity", () => {
  const signIn = "https://accounts.google.com/signin";
  const gmail = "https://mail.google.com/mail/";

  it("judges a top-level navigation by where it's going", () => {
    const base = { resourceType: "mainFrame", pageIsSignIn: false, pageUrl: gmail };
    expect(requestUsesSignInIdentity({ ...base, url: signIn })).toBe(true);
    expect(
      requestUsesSignInIdentity({ ...base, url: gmail, pageIsSignIn: true, pageUrl: signIn }),
    ).toBe(false);
  });

  it("judges everything else by the page it belongs to", () => {
    const script = { url: "https://www.gstatic.com/x.js", resourceType: "script" };
    expect(requestUsesSignInIdentity({ ...script, pageIsSignIn: true, pageUrl: signIn })).toBe(
      true,
    );
    // An accounts.google.com frame inside Gmail stays Chrome like Gmail
    expect(
      requestUsesSignInIdentity({
        url: "https://accounts.google.com/RotateCookiesPage",
        resourceType: "subFrame",
        pageIsSignIn: false,
        pageUrl: gmail,
      }),
    ).toBe(false);
  });

  it("falls back to the page's URL, then the request's, when the view isn't tracked", () => {
    const script = { url: "https://www.gstatic.com/x.js", resourceType: "script" };
    expect(requestUsesSignInIdentity({ ...script, pageIsSignIn: undefined, pageUrl: signIn })).toBe(
      true,
    );
    expect(
      requestUsesSignInIdentity({
        url: signIn,
        resourceType: "xhr",
        pageIsSignIn: undefined,
        pageUrl: undefined,
      }),
    ).toBe(true);
  });
});

describe("withSignInHeaders", () => {
  it("swaps the User-Agent and drops every Client Hint, whatever its casing", () => {
    const identity = signInIdentity("windows", 150);
    const out = withSignInHeaders(
      {
        "user-agent": "Electron",
        "Sec-CH-UA": '"Electron";v="44"',
        "sec-ch-ua-platform": '"Windows"',
        "sec-ch-ua-full-version-list": "x",
        Accept: "text/html",
      },
      identity,
    );
    expect(out).toEqual({ Accept: "text/html", "User-Agent": identity.userAgent });
  });
});
