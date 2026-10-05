import { describe, expect, it } from "vitest";
import {
  StoredCookie,
  hasGoogleSignIn,
  isGoogleLoginCookie,
  isGoogleSignInCookie,
  pickGoogleLoginSource,
  toCookieToSet,
} from "../electron/googleLogin";

const cookie = (over: Partial<StoredCookie>): StoredCookie => ({
  name: "SID",
  value: "v",
  domain: ".google.com",
  hostOnly: false,
  path: "/",
  secure: true,
  httpOnly: true,
  session: false,
  expirationDate: 1_900_000_000,
  sameSite: "unspecified",
  ...over,
});

describe("isGoogleLoginCookie", () => {
  it("takes google.com and youtube.com cookies and their subdomains", () => {
    expect(isGoogleLoginCookie({ domain: ".google.com" })).toBe(true);
    expect(isGoogleLoginCookie({ domain: "accounts.google.com" })).toBe(true);
    expect(isGoogleLoginCookie({ domain: ".youtube.com" })).toBe(true);
  });

  it("leaves every other site's cookies, lookalikes included", () => {
    expect(isGoogleLoginCookie({ domain: ".reddit.com" })).toBe(false);
    expect(isGoogleLoginCookie({ domain: "evilgoogle.com" })).toBe(false);
    expect(isGoogleLoginCookie({ domain: "google.com.evil.com" })).toBe(false);
    expect(isGoogleLoginCookie({ domain: undefined })).toBe(false);
  });
});

describe("isGoogleSignInCookie / hasGoogleSignIn", () => {
  it("is Google's SID cookie on .google.com only", () => {
    expect(isGoogleSignInCookie({ name: "SID", domain: ".google.com" })).toBe(true);
    expect(isGoogleSignInCookie({ name: "SID", domain: ".youtube.com" })).toBe(false);
    expect(isGoogleSignInCookie({ name: "NID", domain: ".google.com" })).toBe(false);
    expect(isGoogleSignInCookie({ name: "SID", domain: ".reddit.com" })).toBe(false);
  });

  it("tells a signed-in partition from a signed-out one", () => {
    expect(hasGoogleSignIn([{ name: "NID", domain: ".google.com" }])).toBe(false);
    expect(hasGoogleSignIn([{ name: "SID", domain: ".google.com" }])).toBe(true);
    expect(hasGoogleSignIn([])).toBe(false);
  });
});

describe("toCookieToSet", () => {
  it("keeps a domain cookie's domain and expiry", () => {
    expect(toCookieToSet(cookie({}))).toEqual({
      url: "https://google.com/",
      name: "SID",
      value: "v",
      domain: ".google.com",
      path: "/",
      secure: true,
      httpOnly: true,
      expirationDate: 1_900_000_000,
      sameSite: "unspecified",
    });
  });

  it("sets a host-only cookie without a domain, as __Host- cookies need", () => {
    const set = toCookieToSet(
      cookie({ name: "__Host-GAPS", domain: "accounts.google.com", hostOnly: true }),
    );
    expect(set.url).toBe("https://accounts.google.com/");
    expect(set).not.toHaveProperty("domain");
  });

  it("keeps a session cookie a session cookie, and keeps its path", () => {
    const set = toCookieToSet(
      cookie({ session: true, expirationDate: undefined, path: "/accounts" }),
    );
    expect(set).not.toHaveProperty("expirationDate");
    expect(set.url).toBe("https://google.com/accounts");
    expect(set.path).toBe("/accounts");
  });
});

describe("pickGoogleLoginSource", () => {
  const services = [
    { id: "gmail", signedIn: true },
    { id: "reddit", signedIn: false },
    { id: "chat", signedIn: true },
  ];

  it("picks the service last signed in from", () => {
    expect(pickGoogleLoginSource(services, "chat")).toBe("chat");
  });

  it("falls back to the first signed-in service when that one signed out or is gone", () => {
    expect(pickGoogleLoginSource(services, "reddit")).toBe("gmail");
    expect(pickGoogleLoginSource(services, "removed")).toBe("gmail");
    expect(pickGoogleLoginSource(services, null)).toBe("gmail");
  });

  it("is null when no service is signed in", () => {
    expect(pickGoogleLoginSource([{ id: "reddit", signedIn: false }], "reddit")).toBeNull();
    expect(pickGoogleLoginSource([], null)).toBeNull();
  });
});
