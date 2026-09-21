import { describe, expect, it } from "vitest";
import { parseChangelog } from "../src/lib/changelog";
import { stampChangelog } from "../scripts/stamp-changelog.cjs";

describe("stampChangelog", () => {
  const source = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "- New thing",
    "",
    "## [0.1.60] (2026-09-20)",
    "- Old thing",
    "",
  ].join("\n");

  it("dates the [Unreleased] section and opens an empty one above it", () => {
    expect(stampChangelog(source, "0.1.61", "2026-09-21")).toBe(
      [
        "# Changelog",
        "",
        "## [Unreleased]",
        "",
        "## [0.1.61] (2026-09-21)",
        "- New thing",
        "",
        "## [0.1.60] (2026-09-20)",
        "- Old thing",
        "",
      ].join("\n"),
    );
  });

  it("leaves nothing for the Changelog page to show as Unreleased", () => {
    const releases = parseChangelog(stampChangelog(source, "0.1.61", "2026-09-21"));
    expect(releases.map((r) => [r.version, r.unreleased])).toEqual([
      ["0.1.61", false],
      ["0.1.60", false],
    ]);
  });

  it("is a no-op when [Unreleased] is empty or missing", () => {
    const once = stampChangelog(source, "0.1.61", "2026-09-21");
    expect(stampChangelog(once, "0.1.62", "2026-09-22")).toBe(once);

    const released = "# Changelog\n\n## [0.1.60] (2026-09-20)\n- Old thing\n";
    expect(stampChangelog(released, "0.1.61", "2026-09-21")).toBe(released);
  });

  it("keeps Windows line endings", () => {
    const crlf = source.replace(/\n/g, "\r\n");
    const stamped = stampChangelog(crlf, "0.1.61", "2026-09-21");
    expect(stamped).toContain("## [Unreleased]\r\n\r\n## [0.1.61] (2026-09-21)\r\n");
    expect(stamped.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
