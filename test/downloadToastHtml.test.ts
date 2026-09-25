import { describe, expect, it } from "vitest";
import {
  CLOSE_URL,
  OPEN_LOCATION_URL,
  escapeHtml,
  openLocationLabel,
  toastHtml,
} from "../electron/downloadToastHtml";

describe("openLocationLabel", () => {
  it("uses each OS's own wording", () => {
    expect(openLocationLabel("win32")).toBe("Open file location");
    expect(openLocationLabel("darwin")).toBe("Show in Finder");
  });
});

describe("escapeHtml", () => {
  it("escapes markup and attribute metacharacters", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});

describe("toastHtml", () => {
  it("links to the open-location and close sentinels", () => {
    const html = toastHtml("Download complete", "report.pdf", "win32");
    expect(html).toContain(`href="${OPEN_LOCATION_URL}"`);
    expect(html).toContain(`href="${CLOSE_URL}"`);
    expect(html).toContain(">Open file location</a>");
  });

  it("says Show in Finder on macOS", () => {
    expect(toastHtml("Download complete", "report.pdf", "darwin")).toContain(">Show in Finder</a>");
  });

  it("never lets a filename become markup", () => {
    const html = toastHtml("Download complete", `<img src=x onerror="alert(1)">.pdf`, "win32");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;.pdf");
  });
});
