import path from "node:path";
import { sanitizeCredential } from "./masterPassword";
import type { CloudWindowSize, MasterPasswordCredential } from "./shared/types";

// The synced settings that need translating between computers, pure so they
// are unit-tested (test/cloudDeviceSettings.test.ts):
//   - the download folder, stored in the account as a path under the home
//     folder, since C:\Users\me\Downloads and /Users/me/Downloads are the same
//     folder to the person but not to the computer
//   - the window size (its position stays on each computer)
//   - the master password's hash, checked harder than one read from disk

export type PathApi = Pick<typeof path, "relative" | "isAbsolute" | "join" | "sep">;

const MAX_RELATIVE_LENGTH = 400;
// Characters Windows doesn't allow in a folder name, and control characters
// eslint-disable-next-line no-control-regex
const BAD_SEGMENT = /[\\:*?"<>|\u0000-\u001f]/;
// Where a folder from the account may never point: app data and settings
// (AppData on Windows, Library on macOS) and hidden folders such as .ssh.
const PROTECTED_ROOTS = new Set(["appdata", "library"]);

/**
 * The download folder as the account stores it: "" for the system default,
 * a "/"-separated path under `home`, or null for a folder outside it (or the
 * home folder itself), which isn't synced.
 */
export function toHomeRelative(folder: string, home: string, api: PathApi = path): string | null {
  if (!folder) return "";
  const relative = api.relative(home, folder);
  if (!relative || relative.startsWith("..") || api.isAbsolute(relative)) return null;
  return sanitizeHomeRelative(relative.split(api.sep).join("/"));
}

/**
 * A download folder from the account: "", a safe path under the home folder,
 * or null. Anything that could climb out of the home folder, or into app data
 * or a hidden folder, is null, so the computer keeps its own folder.
 */
export function sanitizeHomeRelative(raw: unknown): string | null {
  if (raw === "") return "";
  if (typeof raw !== "string" || raw.length > MAX_RELATIVE_LENGTH) return null;
  const segments = raw.split("/");
  for (const segment of segments) {
    if (!segment || segment.startsWith(".") || BAD_SEGMENT.test(segment)) return null;
    if (segment !== segment.trim()) return null;
  }
  if (PROTECTED_ROOTS.has(segments[0].toLowerCase())) return null;
  return segments.join("/");
}

/** The absolute folder on this computer. */
export function fromHomeRelative(relative: string, home: string, api: PathApi = path): string {
  return api.join(home, ...relative.split("/"));
}

// Same floor as the window's own minimum size (window/create.ts)
const MIN_WIDTH = 480;
const MIN_HEIGHT = 600;
const MAX_SIDE = 16_384;

export const DEFAULT_WINDOW_SIZE: CloudWindowSize = { width: 1200, height: 800 };

export function sanitizeWindowSize(raw: unknown): CloudWindowSize {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_WINDOW_SIZE };
  const r = raw as Record<string, unknown>;
  const side = (value: unknown, min: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(MAX_SIDE, Math.max(min, Math.round(value)))
      : fallback;
  return {
    width: side(r.width, MIN_WIDTH, DEFAULT_WINDOW_SIZE.width),
    height: side(r.height, MIN_HEIGHT, DEFAULT_WINDOW_SIZE.height),
  };
}

/**
 * A master-password hash from the account. Tighter than the check on the one
 * read from disk: a cost the app would never choose could make every unlock
 * take minutes and gigabytes, so it's refused (the lock keeps this computer's).
 */
export function sanitizeCloudCredential(raw: unknown): MasterPasswordCredential | null {
  const credential = sanitizeCredential(raw);
  if (!credential) return null;
  if (credential.cost > 1 << 17 || credential.blockSize > 16) return null;
  if (credential.parallelization > 4 || credential.keyLength > 128) return null;
  if (credential.salt.length > 256 || credential.hash.length > 512) return null;
  return credential;
}
