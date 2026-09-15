import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatReleaseDate, parseChangelog, parseInline } from "../src/lib/changelog";

describe("parseChangelog", () => {
  const source = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [0.1.2] (2026-03-31)",
    "",
    "- Added light/dark mode toggle",
    "- A bullet that wraps",
    "  onto a second line",
    "",
    "## [0.1.1] (2026-03-30)",
    "- Initial release",
  ].join("\n");

  it("reads versions, dates and bullets, newest first", () => {
    const releases = parseChangelog(source);
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ["0.1.2", "2026-03-31"],
      ["0.1.1", "2026-03-30"],
    ]);
    expect(releases[0].entries).toHaveLength(2);
  });

  it("drops an empty Unreleased section and keeps a filled one", () => {
    expect(parseChangelog(source).some((r) => r.unreleased)).toBe(false);
    const filled = parseChangelog("## [Unreleased]\n- Something new");
    expect(filled[0]).toMatchObject({ version: "Unreleased", unreleased: true, date: null });
  });

  it("joins a wrapped bullet onto the item above", () => {
    expect(parseChangelog(source)[0].entries[1]).toEqual([
      { type: "text", value: "A bullet that wraps onto a second line" },
    ]);
  });

  it("handles Windows line endings", () => {
    const releases = parseChangelog(source.replace(/\n/g, "\r\n"));
    expect(releases[1].entries[0]).toEqual([{ type: "text", value: "Initial release" }]);
  });

  it("ignores subheadings instead of treating them as releases", () => {
    const releases = parseChangelog("## [1.0.0]\n### Fixed\n- A fix");
    expect(releases).toHaveLength(1);
    expect(releases[0].entries).toHaveLength(1);
  });

  it("parses the real CHANGELOG.md into releases that all have notes", () => {
    const releases = parseChangelog(readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8"));
    expect(releases.length).toBeGreaterThan(10);
    for (const release of releases) {
      expect(release.unreleased || /^\d+\.\d+\.\d+$/.test(release.version)).toBe(true);
      expect(release.entries.length).toBeGreaterThan(0);
    }
  });
});

describe("parseInline", () => {
  it("splits bold and code out of plain text", () => {
    expect(parseInline("**New.** Press `Ctrl+F` now")).toEqual([
      { type: "strong", children: [{ type: "text", value: "New." }] },
      { type: "text", value: " Press " },
      { type: "code", value: "Ctrl+F" },
      { type: "text", value: " now" },
    ]);
  });

  it("keeps code inside bold, even when the code holds asterisks", () => {
    expect(parseInline("**Ctrl+`**`**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "text", value: "Ctrl+" },
          { type: "code", value: "**" },
        ],
      },
    ]);
  });

  it("leaves unclosed markers as literal text", () => {
    expect(parseInline("a ** b ` c")).toEqual([{ type: "text", value: "a ** b ` c" }]);
  });

  it("links http(s) addresses only", () => {
    expect(parseInline("[docs](https://example.com)")).toEqual([
      { type: "link", href: "https://example.com", children: [{ type: "text", value: "docs" }] },
    ]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([
      { type: "text", value: "[x](javascript:alert(1))" },
    ]);
  });
});

describe("formatReleaseDate", () => {
  it("formats a day key in the local calendar", () => {
    expect(formatReleaseDate("2026-09-15")).toBe(
      new Date(2026, 8, 15).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  });

  it("shows anything else as written", () => {
    expect(formatReleaseDate("mid-March")).toBe("mid-March");
  });
});
