import { describe, expect, it } from "vitest";
import {
  isSameDomain,
  mayRedirectInView,
  mayShowInView,
  normalizeHost,
  shouldKeepInView,
} from "../electron/navigationPolicy";

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

describe("mayShowInView", () => {
  it("shows the service's own pages and allowlisted sign-in pages", () => {
    expect(mayShowInView("https://mail.google.com/mail/u/0", "mail.google.com")).toBe(true);
    expect(mayShowInView("https://accounts.google.com/signin", "mail.google.com")).toBe(true);
    expect(mayShowInView("http://notion.so/page", "notion.so")).toBe(true);
  });

  it("refuses other sites", () => {
    expect(mayShowInView("https://evil.example/phish", "mail.google.com")).toBe(false);
  });

  it("refuses every non-http(s) scheme, even on the service's host", () => {
    for (const url of [
      "file:///C:/Windows/System32/calc.exe",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
      "about:blank",
      "javascript:alert(1)",
      "ftp://notion.so/file",
      "chrome://settings",
      "ms-msdt:/id PCWDiagnostic",
      "not a url",
    ]) {
      expect(mayShowInView(url, "notion.so"), url).toBe(false);
    }
  });

  it("shows a blob URL only when the page that made it stays in view", () => {
    expect(mayShowInView("blob:https://web.whatsapp.com/1234-abcd", "web.whatsapp.com")).toBe(true);
    expect(mayShowInView("blob:https://evil.example/1234-abcd", "web.whatsapp.com")).toBe(false);
    expect(mayShowInView("blob:null/1234-abcd", "web.whatsapp.com")).toBe(false);
  });
});

describe("mayRedirectInView", () => {
  const home = "https://mail.google.com/mail/";
  const redirect = (url: string, startUrl: string | null, pageInitiated = true) =>
    mayRedirectInView({
      url,
      serviceHost: "mail.google.com",
      startUrl,
      pageInitiated,
      homeUrl: home,
    });

  it("follows a redirect that stays on the service or its sign-in", () => {
    expect(redirect("https://accounts.google.com/ServiceLogin", home)).toBe(true);
    expect(redirect("https://accounts.youtube.com/accounts/SetSID", home)).toBe(true);
    expect(redirect("https://mail.google.com/mail/u/0/", "https://mail.google.com/")).toBe(true);
  });

  it("stops an open redirect bouncing the view onto another site (#123)", () => {
    // A same-domain link the page follows, which the server 302s elsewhere
    const viaGoogle = "https://www.google.com/url?q=https://evil.example/";
    const viaFacebook = "https://l.facebook.com/l.php?u=https://evil.example/";
    expect(redirect("https://evil.example/", viaGoogle)).toBe(false);
    expect(redirect("https://evil.example/", viaFacebook)).toBe(false);
    // Even when the app loaded that link (a same-domain window.open)
    expect(redirect("https://evil.example/", viaGoogle, false)).toBe(false);
  });

  it("stops a redirect to a non-http(s) scheme", () => {
    expect(redirect("file:///C:/Users/me/secret.txt", home)).toBe(false);
    expect(redirect("data:text/html,hi", home, false)).toBe(false);
  });

  it("lets the app's own load of the service URL follow its server anywhere", () => {
    expect(redirect("https://sso.example.org/login", home, false)).toBe(true);
  });

  it("gives no such pass when a page started the navigation", () => {
    expect(redirect("https://evil.example/", home, true)).toBe(false);
    expect(redirect("https://evil.example/", null, false)).toBe(false);
  });
});
