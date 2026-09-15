// Parses CHANGELOG.md for the in-app Changelog page. Only the subset the file
// actually uses — "## [version] (date)" headings, "- " bullets, **bold**,
// `code` and [links](https://…) — rather than pulling in a Markdown library.
// The result is plain data the page renders as React elements, so nothing in
// the file is ever injected as HTML.

export type ChangelogInline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: ChangelogInline[] }
  | { type: "link"; href: string; children: ChangelogInline[] };

export interface ChangelogRelease {
  // "0.1.56", or "Unreleased"
  version: string;
  unreleased: boolean;
  // As written in the heading, e.g. "2026-09-15"; null when there isn't one
  date: string | null;
  entries: ChangelogInline[][];
}

// "## [0.1.56] (2026-09-15)", "## [Unreleased]", or the same without brackets.
// "###" never matches: the third character must be whitespace.
const HEADING = /^##\s+\[?([^\]\s(]+)\]?(?:\s*\(([^)]*)\))?/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

export function parseChangelog(source: string): ChangelogRelease[] {
  const blocks: { version: string; date: string | null; items: string[] }[] = [];

  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ version: heading[1], date: heading[2]?.trim() || null, items: [] });
      continue;
    }
    const current = blocks[blocks.length - 1];
    // The "# Changelog" title and anything else before the first release
    if (!current) continue;
    const bullet = line.match(BULLET);
    if (bullet) {
      current.items.push(bullet[1].trim());
      continue;
    }
    // A bullet wrapped onto the next line joins the item above it
    const text = line.trim();
    if (text && !text.startsWith("#") && current.items.length > 0) {
      current.items[current.items.length - 1] += ` ${text}`;
    }
  }

  // An empty [Unreleased] heading is the normal state right after a release
  return blocks
    .filter((block) => block.items.length > 0)
    .map((block) => ({
      version: block.version,
      unreleased: block.version.toLowerCase() === "unreleased",
      date: block.date,
      entries: block.items.map(parseInline),
    }));
}

// Bold, code and links within one bullet. An unclosed marker is left as the
// literal characters rather than swallowing the rest of the line.
export function parseInline(text: string): ChangelogInline[] {
  const nodes: ChangelogInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (text.startsWith("**", i)) {
      const end = findClosing(text, "**", i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (text[i] === "[") {
      // http(s) only — anything else stays plain text and is never clickable
      const link = text.slice(i).match(LINK);
      if (link) {
        flush();
        nodes.push({ type: "link", href: link[2], children: parseInline(link[1]) });
        i += link[0].length;
        continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return nodes;
}

// The next `marker` at or after `from`, stepping over code spans so the "**"
// in "**Ctrl+`*`**" can't close early inside the backticks.
function findClosing(text: string, marker: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith(marker, i)) return i;
    i++;
  }
  return -1;
}

// "2026-09-15" in the user's locale. The date is built from its parts so it
// stays on the same calendar day in every timezone; anything else is shown as
// written.
export function formatReleaseDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const [, y, m, d] = match.map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
