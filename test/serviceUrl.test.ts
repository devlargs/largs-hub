import { describe, expect, it } from "vitest";
import { normalizeServiceUrl, serviceNameFromUrl } from "../src/lib/serviceUrl";

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
    expect(normalizeServiceUrl("todo://internal")).toBeNull();
  });

  it("rejects empty and hostless input", () => {
    expect(normalizeServiceUrl("")).toBeNull();
    expect(normalizeServiceUrl("   ")).toBeNull();
    expect(normalizeServiceUrl("https://")).toBeNull();
  });
});

describe("serviceNameFromUrl", () => {
  it("uses the registrable label, capitalised", () => {
    expect(serviceNameFromUrl("https://app.slack.com")).toBe("Slack");
    expect(serviceNameFromUrl("https://mail.google.com")).toBe("Google");
    expect(serviceNameFromUrl("https://www.notion.so")).toBe("Notion");
  });

  it("works on a schemeless address, the way the form is actually typed into", () => {
    expect(serviceNameFromUrl("mail.proton.me")).toBe("Proton");
  });

  it("ignores the path, query and port", () => {
    expect(serviceNameFromUrl("https://jira.example.com:8443/browse/ABC-1?x=1")).toBe("Example");
  });

  it("handles a host with no subdomain", () => {
    expect(serviceNameFromUrl("https://reddit.com")).toBe("Reddit");
  });

  it("handles a single-label host", () => {
    expect(serviceNameFromUrl("http://localhost:3000")).toBe("Localhost");
  });

  it("returns null when no name can be derived", () => {
    expect(serviceNameFromUrl("")).toBeNull();
    expect(serviceNameFromUrl("   ")).toBeNull();
    expect(serviceNameFromUrl("htps://x.com")).toBeNull();
    expect(serviceNameFromUrl("file:///c:/x")).toBeNull();
  });
});
