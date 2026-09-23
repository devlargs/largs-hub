// --- Version comparison (issue #71) -----------------------------------------
// This used to be `latest !== current`, so any difference counted as newer: a
// deleted release, or a locally built version ahead of the published tag, made
// the app offer an "update" that silently downgraded the user — repeatedly,
// since the comparison stayed unequal afterwards. Pure (test/updaterVersion.test.ts).

/** Parses "1.2.3" or "v1.2.3" into [major, minor, patch]; null if it isn't one. */
export function parseVersion(raw: unknown): [number, number, number] | null {
  if (typeof raw !== "string") return null;
  const match = raw
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True only when `latest` is strictly newer than `current`.
 *
 * Anything unparseable — a pre-release tag like "v0.1.42-rc1", a re-tag, an
 * empty string — returns false. Refusing to act on a tag we don't understand
 * is the safe direction: the install path force-quits the app and runs an
 * installer unattended.
 */
export function isNewerVersion(latest: unknown, current: unknown): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
