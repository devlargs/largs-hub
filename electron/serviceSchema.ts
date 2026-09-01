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

// The Pomodoro service became the Todo service. Stored services still carry
// the old type, name and icon, and nothing downstream recognises "pomodoro" any
// more — the page renders blank and the main process treats it as a web view.
// Folding them forward has to happen on *every* read of the store, not just on
// the write paths that go through sanitizeService, so the rule lives here on
// its own. Returns the same object when there is nothing to change, which is
// what lets a caller tell whether the stored list needs rewriting.
export function migrateLegacyServiceShape(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const s = raw as Record<string, unknown>;
  if (s.type !== "pomodoro") return raw;
  return {
    ...s,
    type: "todo",
    // Only the untouched default name is replaced — a list the user renamed
    // keeps the name they gave it.
    name: s.name === "Pomodoro" ? "Todo" : s.name,
    icon: s.icon === "pomodoro.svg" ? "todo.svg" : s.icon,
  };
}

export function sanitizeService(raw: unknown): Service | null {
  const migrated = migrateLegacyServiceShape(raw);
  if (typeof migrated !== "object" || migrated === null) return null;
  const s = migrated as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0) return null;
  if (typeof s.name !== "string" || s.name.length === 0) return null;
  const type: InternalServiceType | undefined =
    s.type === "todo" || s.type === "notion-notes" ? s.type : undefined;
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
