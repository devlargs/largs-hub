// Which finished downloads "Open file on finish" may open (issue #120).
//
// Opening a file hands it to whatever the OS runs for its type, so an .exe,
// .bat, .ps1, .hta, .lnk, a macOS .command or .pkg and the like would simply run.
// Any page in a service view can start a download, and messaging services let
// other people send you files, so a blocklist would always be one extension
// short. Only an allowlist of documents, images and media opens; everything
// else is left for the user to open themselves (the caller shows it in its
// folder instead).
//
// Macro-enabled or legacy Office formats (.docm, .doc, .xls…), RTF, HTML and SVG
// are left out on purpose: they can run code, or have been used to, in the app
// or browser that opens them. Archives are left out too: macOS unpacks a .zip
// on open, and whatever is inside is the real file.
//
// Pure and Electron-free so it can be unit-tested (test/autoOpenPolicy.test.ts).

const SAFE_EXTENSIONS = new Set([
  // Documents
  "pdf",
  "txt",
  "csv",
  "docx",
  "xlsx",
  "pptx",
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "heic",
  "avif",
  "tif",
  "tiff",
  // Audio and video
  "mp3",
  "m4a",
  "wav",
  "ogg",
  "opus",
  "flac",
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
]);

/**
 * Whether a downloaded file is a type that's safe to open without asking.
 * `filename` may include a directory; only the last part is checked.
 */
export function isSafeToAutoOpen(filename: string, platform: NodeJS.Platform): boolean {
  let name = filename.split(/[\\/]/).pop() ?? "";
  if (platform === "win32") {
    // Windows drops trailing dots and spaces ("run.exe." opens as run.exe), and
    // a colon addresses an alternate data stream rather than being part of the
    // name, so a name with one isn't what it appears to be.
    if (name.includes(":")) return false;
    name = name.replace(/[. ]+$/, "");
  }
  const dot = name.lastIndexOf(".");
  // No extension, or a dotfile like ".bashrc" with no name before the dot.
  if (dot <= 0) return false;
  return SAFE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
