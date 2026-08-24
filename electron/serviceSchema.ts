import type { InternalServiceType, Service } from "./shared/types";

// Runtime validation for service shapes coming off IPC or out of the store.
//
// IPC payload types are compile-time only, so anything crossing the bridge or
// read back from disk has to be checked at runtime before it reaches the store
// or creates a view. Extracted from store.ts so it can be unit-tested without
// instantiating electron-store (issue #87).

export function isSafeServiceUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeService(raw: unknown): Service | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0) return null;
  if (typeof s.name !== "string" || s.name.length === 0) return null;
  const type: InternalServiceType | undefined =
    s.type === "pomodoro" || s.type === "notion-notes" ? s.type : undefined;
  if (!type && !isSafeServiceUrl(s.url)) return null;
  return {
    id: s.id,
    name: s.name,
    url: typeof s.url === "string" ? s.url : "",
    icon: typeof s.icon === "string" ? s.icon : "",
    color: typeof s.color === "string" ? s.color : "#888888",
    notificationCount: 0,
    muted: s.muted === true,
    enabled: s.enabled !== false,
    notificationsEnabled: s.notificationsEnabled !== false,
    blurWhenInactive: s.blurWhenInactive === true,
    privacyMode: s.privacyMode === true,
    ...(type ? { type } : {}),
  };
}
