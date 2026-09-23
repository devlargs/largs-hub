// Editing the Report an issue description around a pasted image: put a
// placeholder at the cursor while it uploads, then swap in its markdown. Pure
// so it can be unit-tested.

// What GitHub's own editor shows while an image uploads
export function uploadPlaceholder(fileName: string): string {
  return `<!-- Uploading "${fileName}"… -->`;
}

/**
 * `snippet` inserted at `cursor` (over the selection from `cursor` to
 * `selectionEnd`, if any), on its own line so markdown images don't run into
 * the text around them. Returns the new text and where the cursor goes.
 */
export function insertAt(
  text: string,
  cursor: number,
  snippet: string,
  selectionEnd = cursor,
): { text: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after = text.slice(selectionEnd);
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const trail = after === "" || after.startsWith("\n") ? "" : "\n";
  const inserted = `${lead}${snippet}${trail}`;
  return { text: before + inserted + after, cursor: before.length + inserted.length };
}

/** `text` with `placeholder` swapped for `replacement` (empty removes it and its line). */
export function replacePlaceholder(text: string, placeholder: string, replacement: string): string {
  if (!text.includes(placeholder)) return text;
  if (replacement) return text.replace(placeholder, replacement);
  return text.replace(`${placeholder}\n`, "").replace(placeholder, "");
}
