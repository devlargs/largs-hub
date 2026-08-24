import { app } from "electron";
import path from "path";

// Where uploaded service icons live, and the one function allowed to turn a
// caller-supplied name into a path inside it.
//
// This used to exist only in ipc/settings.ts, so the custom-icon:// protocol
// handler built its paths by hand and had no containment check at all — a URL
// like "custom-icon://..%2F..%2F..%2Fsomething" escaped the directory and was
// served back (issue #67). Both callers now share this.

export function customIconsDir(): string {
  return path.join(app.getPath("userData"), "custom-icons");
}

/**
 * Resolves `fileName` to a path inside `dir`, or null if it doesn't belong
 * there. `dir` is a parameter rather than read from Electron so this stays
 * pure and testable (see test/customIcons.test.ts).
 */
export function resolveCustomIconPath(fileName: unknown, dir: string): string | null {
  if (typeof fileName !== "string" || fileName.length === 0) return null;
  // Strip any directory components (e.g. "../../evil") before joining
  const safeName = path.basename(fileName);
  if (safeName === "." || safeName === "..") return null;
  // basename() alone isn't enough: a name can still be absolute on Windows
  // ("C:evil.png") or contain a drive-relative prefix, so the containment
  // check below is what actually decides.
  const resolvedDir = path.resolve(dir);
  const filePath = path.resolve(resolvedDir, safeName);
  if (!filePath.startsWith(resolvedDir + path.sep)) return null;
  return filePath;
}
