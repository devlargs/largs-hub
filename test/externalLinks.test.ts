import { describe, expect, it } from "vitest";
import { externalServiceUrl, externalWebUrl } from "../electron/externalLinks";

// Schemes that launch OS handlers, several of them exploitable on Windows.
const DANGEROUS = [
  "ms-msdt:/id PCWDiagnostic /skip force /param IT_BrowseForFile=calc.exe",
  "search-ms:query=invoice&crumb=location:\\\\attacker.example\\share",
  "ms-officecmd:%7B%22id%22:3%7D",
  "file:///C:/Windows/System32/calc.exe",
  "file://attacker.example/share/payload.exe",
  "\\\\attacker.example\\share\\payload.exe",
  "smb://attacker.example/share",
  "javascript:alert(1)",
  "vbscript:msgbox(1)",
  "data:text/html,<script>alert(1)</script>",
  "slack://open",
  "zoommtg://zoom.us/join?confno=1",
];

describe("externalWebUrl", () => {
  it("allows http and https links", () => {
    expect(externalWebUrl("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(externalWebUrl("http://example.com")).toBe("http://example.com/");
  });

  it("matches the scheme case-insensitively and returns it normalised", () => {
    expect(externalWebUrl("HTTPS://Example.com/Path")).toBe("https://example.com/Path");
  });

  it("drops mailto: and tel:", () => {
    expect(externalWebUrl("mailto:someone@example.com")).toBeNull();
    expect(externalWebUrl("tel:+15551234567")).toBeNull();
  });

  it.each(DANGEROUS)("drops %s", (url) => {
    expect(externalWebUrl(url)).toBeNull();
  });

  it("hands the OS the parsed URL, not the raw string", () => {
    // Backslashes in a web URL are slashes to the URL parser, but a raw
    // "http:\\host\share" given to the OS could be read as a UNC path.
    expect(externalWebUrl("http:\\\\attacker.example\\share")).toBe(
      "http://attacker.example/share",
    );
  });

  it("drops anything that isn't a parseable absolute URL", () => {
    expect(externalWebUrl("")).toBeNull();
    expect(externalWebUrl("/relative/path")).toBeNull();
    expect(externalWebUrl("not a url")).toBeNull();
    expect(externalWebUrl(undefined)).toBeNull();
    expect(externalWebUrl(42)).toBeNull();
  });
});

describe("externalServiceUrl", () => {
  it("allows http(s), mailto: and tel:", () => {
    expect(externalServiceUrl("https://example.com/")).toBe("https://example.com/");
    expect(externalServiceUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com");
    expect(externalServiceUrl("tel:+15551234567")).toBe("tel:+15551234567");
  });

  it.each(DANGEROUS)("drops %s", (url) => {
    expect(externalServiceUrl(url)).toBeNull();
  });
});
