import type { RemoteLockInfo } from "./types";

// Whether this computer should be locked because the account is active on
// another one (single active device). Pure, and in shared/ so the renderer's
// sync engine (src/lib/cloudSync.ts) and the tests use the same rule.

export interface SessionSnapshot {
  activeDeviceId: string | null;
  activeDeviceName?: string;
  activePlatform?: string;
}

export type RemoteLockDecision =
  { action: "lock"; info: RemoteLockInfo } | { action: "unlock" } | { action: "ignore" };

export function decideRemoteLock(params: {
  session: SessionSnapshot | null;
  myDeviceId: string;
  // The snapshot came from Firestore's offline cache, not the server
  fromCache: boolean;
  now: number;
}): RemoteLockDecision {
  const { session, myDeviceId, fromCache, now } = params;
  // Cached data may be hours old: never lock a computer on it, or an offline
  // launch would lock itself out of its own workspace.
  if (fromCache) return { action: "ignore" };
  if (!session || session.activeDeviceId === null) return { action: "unlock" };
  if (session.activeDeviceId === myDeviceId) return { action: "unlock" };
  return {
    action: "lock",
    info: {
      deviceName: session.activeDeviceName?.trim() || "another computer",
      platform: session.activePlatform ?? "",
      since: now,
    },
  };
}

/** "Windows", "macOS", "Linux", or "" for a platform we don't name. */
export function platformLabel(platform: string): string {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return "";
}

/** "<name> (Windows)", or just the name when the platform is unknown. */
export function deviceDisplayName(deviceName: string, platform: string): string {
  const label = platformLabel(platform);
  return label ? `${deviceName} (${label})` : deviceName;
}

/** Checks a RemoteLockInfo coming over IPC; null when it isn't one. */
export function sanitizeRemoteLockInfo(raw: unknown): RemoteLockInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.deviceName !== "string" || typeof r.platform !== "string") return null;
  if (typeof r.since !== "number" || !Number.isFinite(r.since)) return null;
  return {
    deviceName: r.deviceName.slice(0, 200),
    platform: r.platform.slice(0, 32),
    since: r.since,
  };
}
