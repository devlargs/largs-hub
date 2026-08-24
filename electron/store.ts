import Store from "electron-store";
import { PomodoroData, PomodoroNotionConfig } from "./tasks";
import { MessageListGroup } from "./messageLists";
import type { InternalServiceType, Service } from "./shared/types";

// Persistent app state (electron-store) and the shapes stored in it.
// The Service interface is intentionally duplicated in preload.ts and
// src/types.ts — the three layers must stay in sync (see CLAUDE.md).

// Service and the internal-service predicate are shared with the preload
// bridge and the renderer (shared/types.ts); re-exported here so the many
// existing `from "./store"` imports keep working.
export type { InternalServiceType, Service } from "./shared/types";
export { isInternalService } from "./shared/types";

export interface StoreSchema {
  services: Service[];
  windowBounds: { width: number; height: number; x?: number; y?: number };
  // Whether the window was maximized when it was last closed. Without this the
  // window maximized on every launch, so an auto-update relaunch threw away
  // whatever size the user had it at (issue #92).
  windowMaximized: boolean;
  // The service shown when the app was last used, reopened on launch instead
  // of always landing on the Welcome screen (issue #89)
  lastActiveServiceId: string | null;
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
  // Per-service zoom factor, keyed by service id. Re-applied whenever the
  // service view is created so a zoom survives hibernation and restarts.
  serviceZoom: Record<string, number>;
  // Saved message lists for the Messenger "Random list" automation. Global,
  // not per-service, so a list can be used with any Messenger account.
  // sanitizeMessageListGroup lives in messageLists.ts rather than beside
  // sanitizeService below, so it can be unit-tested without an Electron runtime.
  messageListGroups: MessageListGroup[];
  // Emojis most recently used to start an emoji burst, newest first — the
  // "Recent" pane in the Messenger automation panel.
  recentEmojis: string[];
  // Pomodoro service: local task state (the source of truth for writes) and
  // the optional Notion connection behind it, both keyed by service id
  pomodoroTasks: Record<string, PomodoroData>;
  pomodoroNotion: Record<string, PomodoroNotionConfig>;
}

export const store = new Store<StoreSchema>({
  defaults: {
    services: [],
    windowBounds: { width: 1200, height: 800 },
    windowMaximized: true,
    lastActiveServiceId: null,
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
    serviceZoom: {},
    messageListGroups: [],
    recentEmojis: [],
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
