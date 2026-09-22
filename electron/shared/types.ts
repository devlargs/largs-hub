// Domain and IPC payload types shared by the main process, the preload bridge
// and the renderer.
//
// These used to be typed out three times over (electron/store.ts,
// electron/preload.ts, src/types.ts) with a note in CLAUDE.md asking readers to
// keep them in step — nothing checked it, so adding a field in one place and
// not the others compiled cleanly and only broke at runtime (issue #82).
//
// Same rules as shared/layout.ts: pure declarations and small predicates only,
// no `electron` or `node:` imports, since this file is compiled into the main
// bundle and pulled into the renderer bundle by Vite.

export interface AppSettings {
  downloadFolder: string;
  wakeServicesAutomatically: boolean;
  launchAtStartup: boolean;
  openFolderOnFinish: boolean;
  openFileOnFinish: boolean;
  downloadAlertOnFinish: boolean;
  // Minutes an inactive service may idle before its view is hibernated (0 = off)
  hibernateInactiveMinutes: number;
  // Keep running in the tray instead of quitting when the window is closed
  closeToTray: boolean;
  minimizeToTray: boolean;
  // Privacy mode appearance: the vertical cover spans a share of the page
  // height from the top, the horizontal cover a share of the width from the
  // left. Sizes and opacities are 0-100; a size of 0 disables that cover.
  privacyCoverPercent: number;
  privacyOpacity: number;
  privacyHorizontalPercent: number;
  privacyHorizontalOpacity: number;
}

// --- Security controls (workspace lock) --------------------------------------

// What the renderer is allowed to know about the lock. The stored credential
// never crosses the bridge — only whether one exists.
export interface SecurityState {
  enabled: boolean;
  hasPassword: boolean;
  // Minutes the window may stay minimized before the workspace locks
  lockDelayMinutes: number;
  locked: boolean;
}

export interface SecurityResult {
  ok: boolean;
  // Present when ok is false: a sentence to show under the field
  error?: string;
}

export type InternalServiceType = "notion-notes";

export function isInternalService(service: { type?: string } | null | undefined): boolean {
  return service?.type === "notion-notes";
}

// The Todo service is the tasks web app (the devlargs/tasks repo), hosted as an
// ordinary web service so it's only ever changed in one place.
export const TASKS_URL = "https://tasks.ralphlargo.com";

// Whether a service is the Todo service, told apart by the host it loads. It's
// a task list with no sound, no notifications and nothing private to hide, so
// the per-service Sound, Notifications, Blur when inactive and Privacy mode
// switches don't apply to it.
export function isTasksService(service: { url?: string } | null | undefined): boolean {
  if (!service?.url) return false;
  try {
    return new URL(service.url).hostname === new URL(TASKS_URL).hostname;
  } catch {
    return false;
  }
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
  // Covers the top half of the service page so only the bottom 50% is visible
  privacyMode?: boolean;
  // Internal services render as React pages instead of getting a
  // WebContentsView in the main process. The only one left is "notion-notes",
  // which is retired (the Note Taker was replaced by Todo) and only renders a
  // migration notice.
  type?: InternalServiceType;
}

export type TaskSpec =
  | { type: "sendChat"; message: string; time: string }
  | { type: "sendChatInterval"; message: string; fromSec: number; toSec: number }
  | { type: "sendChatMessage"; message: string }
  | { type: "sendEmoji"; emoji: string; fromSec: number; toSec: number; maxLength: number }
  | { type: "sendRandomFromList"; name: string; messages: string[]; fromSec: number; toSec: number }
  | { type: "startCallCycle"; fromSec: number; toSec: number; ringSeconds: number };

// --- Saved message lists (Messenger "Random list" automation) ---------------

export interface MessageListGroup {
  id: string;
  name: string;
  messages: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ListGroupsResult {
  ok: boolean;
  error?: string;
  groups: MessageListGroup[];
}

export interface AutomationTask {
  id: string;
  serviceId: string;
  spec: TaskSpec;
  status: "scheduled" | "running";
  nextFireAt: number | null;
  fireCount: number;
  lastResult?: string;
  createdAt: number;
}

export interface StartResult {
  ok: boolean;
  error?: string;
  tasks: AutomationTask[];
}

export interface AutoStopState {
  serviceId: string;
  minutes: number;
  expiresAt: number;
}

export interface AutoStopResult {
  ok: boolean;
  error?: string;
  autoStop: AutoStopState | null;
}

export interface AutoStopUpdate {
  serviceId: string;
  autoStop: AutoStopState | null;
  // True when this push follows an expired auto-stop clearing the task list.
  fired: boolean;
}

// Why a call cycle cancelled itself: the other person reacted in the thread.
export type NoticeReason = "replied" | "seen" | "typing";
