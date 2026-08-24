import { describe, expect, it } from "vitest";
import { normalizeServiceUrl } from "../src/lib/serviceUrl";

describe("normalizeServiceUrl", () => {
  it("accepts a full http(s) URL", () => {
    expect(normalizeServiceUrl("https://mail.google.com")).toBe("https://mail.google.com/");
    expect(normalizeServiceUrl("http://localhost:3000/app")).toBe("http://localhost:3000/app");
  });

  it("adds https to a bare host — the common typing case", () => {
    expect(normalizeServiceUrl("mail.proton.me")).toBe("https://mail.proton.me/");
    expect(normalizeServiceUrl("  app.slack.com/client  ")).toBe("https://app.slack.com/client");
  });

  it("rejects a mistyped scheme rather than repairing it", () => {
    // "htps://" looks like a scheme, so it is taken at its word and refused
    expect(normalizeServiceUrl("htps://mail.google.com")).toBeNull();
    expect(normalizeServiceUrl("ttps://x.com")).toBeNull();
  });

  it("rejects non-web schemes", () => {
    expect(normalizeServiceUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeServiceUrl("javascript://alert(1)")).toBeNull();
    expect(normalizeServiceUrl("pomodoro://internal")).toBeNull();
  });

  it("rejects empty and hostless input", () => {
    expect(normalizeServiceUrl("")).toBeNull();
    expect(normalizeServiceUrl("   ")).toBeNull();
    expect(normalizeServiceUrl("https://")).toBeNull();
  });
});
