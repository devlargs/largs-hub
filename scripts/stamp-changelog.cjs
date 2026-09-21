// Turns CHANGELOG.md's "## [Unreleased]" heading into "## [<version>] (<date>)"
// and opens a fresh, empty [Unreleased] section above it.
//
//   node scripts/stamp-changelog.cjs <version> <date>
//
// The release workflow runs this before packaging as well as before committing:
// the in-app Changelog page bundles CHANGELOG.md at build time, so stamping only
// after the build shipped every installer with its own changes still listed as
// "Unreleased". Node rather than sed so it behaves the same on the Windows and
// macOS runners (BSD sed on macOS takes `-i` differently).
const fs = require("fs");
const path = require("path");

const UNRELEASED = /^## \[Unreleased\][^\S\r\n]*$/m;

// Pure so it can be tested. Returns the source unchanged when there is no
// [Unreleased] heading or nothing under it, so a second run is a no-op and a
// release without changelog entries doesn't leave an empty version heading.
function stampChangelog(source, version, date) {
  const match = UNRELEASED.exec(source);
  if (!match) return source;
  const rest = source.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  if (!(next === -1 ? rest : rest.slice(0, next)).trim()) return source;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  return source.replace(UNRELEASED, `## [Unreleased]${eol}${eol}## [${version}] (${date})`);
}

exports.stampChangelog = stampChangelog;

if (require.main === module) {
  const [version, date] = process.argv.slice(2);
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    console.error("usage: node scripts/stamp-changelog.cjs <x.y.z> <yyyy-mm-dd>");
    process.exit(1);
  }
  const file = path.join(__dirname, "..", "CHANGELOG.md");
  fs.writeFileSync(file, stampChangelog(fs.readFileSync(file, "utf8"), version, date));
}
