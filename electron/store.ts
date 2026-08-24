import Store from "electron-store";
import { PomodoroData, PomodoroNotionConfig } from "./tasks";

// Persistent app state (electron-store) and the shapes stored in it.
// The Service interface is intentionally duplicated in preload.ts and
// src/types.ts — the three layers must stay in sync (see CLAUDE.md).

// Internal (non-web) service types. Kept in sync with preload.ts and
// src/types.ts, where the Service interface is duplicated (see CLAUDE.md).
export type InternalServiceType = "pomodoro" | "notion-notes";

export function isInternalService(service: { type?: string } | undefined | null): boolean {
  return service?.type === "pomodoro" || service?.type === "notion-notes";
}

export interface Service {
  id: string;
  name: string;
  url: string;
  icon: string;
  color: string;
  notificationCount: number;
  muted?: boolean;
  enabled?: boolean;
  notificationsEnabled?: boolean;
  blurWhenInactive?: boolean;
  // Privacy mode: cover the top half of the service page so only the bottom
  // 50% is readable to onlookers
  privacyMode?: boolean;
  // Internal services render as React pages in the UI view instead of getting
  // a WebContentsView. "notion-notes" is retired — the Note Taker was replaced
  // by Pomodoro; services still carrying it render a one-time notice.
  type?: InternalServiceType;
}

export interface StoreSchema {
  services: Service[];
  sidebarWidth: number;
  windowBounds: { width: number; height: number; x?: number; y?: number };
  theme: "dark" | "light";
  downloadFolder: string;
  wakeServicesAutomatically: boolean;
  launchAtStartup: boolean;
  openFolderOnFinish: boolean;
  openFileOnFinish: boolean;
  downloadAlertOnFinish: boolean;
  // Minutes an inactive service view may sit idle before it's torn down to
  // reclaim its renderer process (0 = never hibernate). Session state survives
  // in the persist: partition, so the view reloads on next click.
  hibernateInactiveMinutes: number;
  // Privacy mode appearance (applies to every service with privacyMode on):
  // the vertical cover spans a share of the page height from the top, the
  // horizontal cover a share of the page width from the left. Sizes and
  // opacities are 0-100; a size of 0 disables that cover.
  privacyCoverPercent: number;
  privacyOpacity: number;
  privacyHorizontalPercent: number;
  privacyHorizontalOpacity: number;
  // Pomodoro service: local task state (the source of truth for writes) and
  // the optional Notion connection behind it, both keyed by service id
  pomodoroTasks: Record<string, PomodoroData>;
  pomodoroNotion: Record<string, PomodoroNotionConfig>;
}

export const store = new Store<StoreSchema>({
  defaults: {
    services: [],
    sidebarWidth: 68,
    windowBounds: { width: 1200, height: 800 },
    theme: "dark",
    downloadFolder: "",
    wakeServicesAutomatically: true,
    launchAtStartup: false,
    openFolderOnFinish: true,
    openFileOnFinish: false,
    downloadAlertOnFinish: true,
    hibernateInactiveMinutes: 0,
    privacyCoverPercent: 50,
    privacyOpacity: 100,
    privacyHorizontalPercent: 0,
    privacyHorizontalOpacity: 100,
    pomodoroTasks: {},
    pomodoroNotion: {},
  },
});

// One-time cleanup: the Notion Note Taker was replaced by the Pomodoro
// service, so its stored configs (which hold an encrypted integration token)
// are dead weight. Nothing reads the key any more — drop it on first launch.
const legacyStore = store as unknown as {
  has(key: string): boolean;
  delete(key: string): void;
};
if (legacyStore.has("notionNotes")) {
  legacyStore.delete("notionNotes");
}

// --- Stored-shape validation -------------------------------------------------
// IPC payload types are compile-time only; validate shapes at runtime before
// touching the store or creating views.

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
