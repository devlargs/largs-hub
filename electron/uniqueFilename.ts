import path from "path";
import fs from "fs";

// Pick a filename that won't overwrite an existing file, the way a browser
// does: report.pdf → report (1).pdf → report (2).pdf.
//
// Chromium only handles collisions itself when it shows its own save dialog.
// With a download folder configured the app sets the path directly, so an
// existing file of the same name was silently written over (issue #72).

/** How many suffixes to try before giving up and letting the write clobber. */
const MAX_ATTEMPTS = 1000;

export interface FileExists {
  (filePath: string): boolean;
}

/**
 * Split a filename into the stem and the extension to re-attach.
 *
 * A leading dot is part of the name, not an extension (`.gitignore` must not
 * become ` (1).gitignore`), and a double extension keeps only the last part —
 * `archive.tar.gz` becomes `archive.tar (1).gz`, matching Chrome.
 */
export function splitFilename(fileName: string): { stem: string; ext: string } {
  const ext = path.extname(fileName);
  if (!ext || ext === fileName) return { stem: fileName, ext: "" };
  return { stem: fileName.slice(0, -ext.length), ext };
}

/**
 * The path to save `fileName` into `folder` at, avoiding any existing file.
 * `exists` is injectable so the loop can be unit-tested without touching disk.
 */
export function uniqueSavePath(
  folder: string,
  fileName: string,
  exists: FileExists = fs.existsSync,
): string {
  const first = path.join(folder, fileName);
  if (!exists(first)) return first;

  const { stem, ext } = splitFilename(fileName);
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const candidate = path.join(folder, `${stem} (${n})${ext}`);
    if (!exists(candidate)) return candidate;
  }
  // A thousand copies of one name: fall back rather than loop forever.
  return first;
}
