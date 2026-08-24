import { describe, expect, it } from "vitest";
import { isSameDomain, normalizeHost, shouldKeepInView } from "../electron/navigationPolicy";

describe("isSameDomain", () => {
  it("matches the domain itself and its subdomains", () => {
    expect(isSameDomain("notion.so", "notion.so")).toBe(true);
    expect(isSameDomain("www.notion.so", "notion.so")).toBe(true);
    expect(isSameDomain("a.b.notion.so", "notion.so")).toBe(true);
  });

  it("requires a dot boundary — this is the #68 hole", () => {
    expect(isSameDomain("evilnotion.so", "notion.so")).toBe(false);
    expect(isSameDomain("notion.so.evil.com", "notion.so")).toBe(false);
    expect(isSameDomain("xnotion.so", "notion.so")).toBe(false);
  });

  it("is false for empty input", () => {
    expect(isSameDomain("", "notion.so")).toBe(false);
    expect(isSameDomain("notion.so", "")).toBe(false);
  });
});

describe("shouldKeepInView", () => {
  it("keeps the service's own domain and its subdomains", () => {
    expect(shouldKeepInView("https://notion.so/page", "notion.so")).toBe(true);
    expect(shouldKeepInView("https://www.notion.so/page", "notion.so")).toBe(true);
    expect(shouldKeepInView("https://sub.notion.so/x", "notion.so")).toBe(true);
  });

  it("still matches the reverse direction across a real boundary", () => {
    // A service registered at web.whatsapp.com should accept whatsapp.com
    expect(shouldKeepInView("https://whatsapp.com/x", "web.whatsapp.com")).toBe(true);
  });

  it("rejects a lookalike of the service domain", () => {
    expect(shouldKeepInView("https://evilnotion.so/steal", "notion.so")).toBe(false);
    expect(shouldKeepInView("https://notion.so.evil.com/", "notion.so")).toBe(false);
  });

  it("rejects a lookalike in the reverse direction", () => {
    // "m.com" is a suffix of "web.whatsapp.com" only without a dot boundary
    expect(shouldKeepInView("https://m.com/", "web.whatsapp.com")).toBe(false);
    expect(shouldKeepInView("https://app.com/", "web.whatsapp.com")).toBe(false);
  });

  it("keeps allowlisted auth providers", () => {
    expect(shouldKeepInView("https://accounts.google.com/signin", "notion.so")).toBe(true);
    expect(shouldKeepInView("https://login.microsoftonline.com/", "slack.com")).toBe(true);
  });

  it("rejects a lookalike of an allowlisted provider", () => {
    expect(shouldKeepInView("https://evilgoogle.com/signin", "notion.so")).toBe(false);
    expect(shouldKeepInView("https://google.com.attacker.net/", "notion.so")).toBe(false);
  });

  it("rejects everything else, and unparseable URLs", () => {
    expect(shouldKeepInView("https://example.com/", "notion.so")).toBe(false);
    expect(shouldKeepInView("not a url", "notion.so")).toBe(false);
    expect(shouldKeepInView("", "notion.so")).toBe(false);
  });

  it("falls back to the allowlist when the service has no host", () => {
    expect(shouldKeepInView("https://example.com/", "")).toBe(false);
    expect(shouldKeepInView("https://github.com/", null)).toBe(true);
  });
});

describe("normalizeHost", () => {
  it("drops a leading www.", () => {
    expect(normalizeHost("www.notion.so")).toBe("notion.so");
    expect(normalizeHost("notion.so")).toBe("notion.so");
  });
});
