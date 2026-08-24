export interface AppSettings {
  downloadFolder: string;
  wakeServicesAutomatically: boolean;
  launchAtStartup: boolean;
  openFolderOnFinish: boolean;
  openFileOnFinish: boolean;
  downloadAlertOnFinish: boolean;
  // Minutes an inactive service may idle before its view is hibernated (0 = off)
  hibernateInactiveMinutes: number;
  // Privacy mode appearance: the vertical cover spans a share of the page
  // height from the top, the horizontal cover a share of the width from the
  // left. Sizes and opacities are 0-100; a size of 0 disables that cover.
  privacyCoverPercent: number;
  privacyOpacity: number;
  privacyHorizontalPercent: number;
  privacyHorizontalOpacity: number;
}

export type InternalServiceType = "pomodoro" | "notion-notes";

export function isInternalService(service: { type?: string } | null | undefined): boolean {
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
  // Covers the top half of the service page so only the bottom 50% is visible
  privacyMode?: boolean;
  // Internal services render as React pages instead of getting a
  // WebContentsView in the main process. "notion-notes" is retired (the Note
  // Taker was replaced by Pomodoro) and only renders a migration notice.
  type?: InternalServiceType;
}

// --- Pomodoro (internal "pomodoro" service) ---------------------------------

export interface PomodoroTask {
  id: string;
  text: string;
  done: boolean;
  // The day this task belongs to, YYYY-MM-DD in local time
  date: string;
  order: number;
  // Notion page id, present once the task has been pushed
  pageId?: string;
  editedAt: string;
  // Completed focus sessions spent on this task
  focusSessions: number;
}

// Notion connection state for the service (not the same as sync health)
export type PomodoroConnectionState = "local" | "pending" | "pending-adoptable" | "ready";

export type PomodoroSyncStatus = "local" | "synced" | "syncing" | "offline";

export interface PomodoroSyncState {
  serviceId: string;
  status: PomodoroSyncStatus;
  pending: number;
  error?: string;
}

export interface PomodoroListResult {
  ok: boolean;
  error?: string;
  tasks?: PomodoroTask[];
  pulledAt?: number;
  sync?: PomodoroSyncState;
}

export interface PomodoroTaskResult {
  ok: boolean;
  error?: string;
  task?: PomodoroTask;
  tasks?: PomodoroTask[];
}

export interface PomodoroConnectResult {
  ok: boolean;
  error?: string;
  needsReset?: boolean;
  adoptable?: boolean;
}

export type PomodoroTimerPhase = "focus" | "break";

export interface PomodoroTimerState {
  serviceId: string;
  taskId: string | null;
  phase: PomodoroTimerPhase;
  running: boolean;
  // Epoch ms the current phase ends; the UI ticks its countdown from this
  endsAt: number;
  remainingMs: number;
  completedFocus: number;
}

export type TaskSpec =
  | { type: "sendChat"; message: string; time: string }
  | { type: "sendChatInterval"; message: string; fromSec: number; toSec: number }
  | { type: "sendChatMessage"; message: string }
  | { type: "sendEmoji"; emoji: string; fromSec: number; toSec: number; maxLength: number }
  | { type: "startCallCycle"; fromSec: number; toSec: number; ringSeconds: number };

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

export interface ElectronAPI {
  getServices: () => Promise<Service[]>;
  addService: (service: Service) => Promise<Service[]>;
  removeService: (serviceId: string) => Promise<Service[]>;
  updateService: (service: Service) => Promise<Service[]>;
  reorderServices: (serviceIds: string[]) => Promise<Service[]>;
  toggleMuteService: (serviceId: string) => Promise<Service[]>;
  toggleServiceEnabled: (serviceId: string) => Promise<Service[]>;
  toggleServiceNotifications: (serviceId: string) => Promise<Service[]>;
  showService: (serviceId: string) => void;
  hideService: () => Promise<void>;
  bringUiToFront: () => void;
  sendUiToBack: () => void;
  showServiceContextMenu: (serviceId: string) => void;
  showSettingsMenu: () => void;
  onServicesUpdated: (callback: (services: Service[]) => void) => () => void;
  onContextMenuAction: (callback: (data: { action: string; serviceId: string }) => void) => () => void;
  onServiceSwitched: (callback: (serviceId: string) => void) => () => void;
  reloadService: (serviceId: string) => void;
  goBack: (serviceId: string) => void;
  goForward: (serviceId: string) => void;
  closeLinkPreview: () => void;
  openLinkExternal: (url: string) => void;
  onLinkPreviewOpen: (callback: (url: string) => void) => () => void;
  onLinkPreviewClosed: (callback: () => void) => () => void;
  onLinkPreviewNavigated: (callback: (url: string) => void) => () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onNotificationUpdate: (
    callback: (data: { serviceId: string; count: number }) => void
  ) => () => void;
  getTheme: () => Promise<"dark" | "light">;
  setTheme: (theme: "dark" | "light") => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
  selectDownloadFolder: () => Promise<string | null>;
  saveCustomIcon: (fileName: string, dataUrl: string) => Promise<string>;
  deleteCustomIcon: (fileName: string) => Promise<void>;
  checkForUpdates: () => Promise<{ updateAvailable: boolean; version?: string; downloadUrl?: string }>;
  getAppVersion: () => Promise<string>;
  downloadAndInstallUpdate: () => Promise<void>;
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => () => void;
  onDownloadComplete: (callback: (fileName: string) => void) => () => void;
  pomodoro: {
    getState: (serviceId: string) => Promise<PomodoroConnectionState>;
    connect: (
      serviceId: string,
      apiKey: string,
      databaseId: string
    ) => Promise<PomodoroConnectResult>;
    resetDatabase: (serviceId: string) => Promise<{ ok: boolean; error?: string }>;
    adoptDatabase: (serviceId: string) => Promise<{ ok: boolean; error?: string }>;
    disconnect: (serviceId: string) => Promise<void>;
    list: (serviceId: string, date: string) => Promise<PomodoroListResult>;
    refresh: (serviceId: string, date: string) => Promise<PomodoroListResult>;
    create: (serviceId: string, date: string, text: string) => Promise<PomodoroTaskResult>;
    update: (
      serviceId: string,
      taskId: string,
      patch: { text?: string; done?: boolean }
    ) => Promise<PomodoroTaskResult>;
    remove: (serviceId: string, taskId: string) => Promise<PomodoroTaskResult>;
    reorder: (serviceId: string, date: string, taskIds: string[]) => Promise<PomodoroTaskResult>;
    carryOver: (
      serviceId: string,
      fromDate: string,
      toDate: string
    ) => Promise<PomodoroTaskResult & { moved?: number }>;
    pendingCount: (serviceId: string, date: string) => Promise<number>;
    syncState: (serviceId: string) => Promise<PomodoroSyncState | null>;
    retrySync: (serviceId: string) => Promise<PomodoroSyncState | null>;
    onSyncUpdated: (callback: (state: PomodoroSyncState) => void) => () => void;
    onTasksUpdated: (
      callback: (data: { serviceId: string; tasks: PomodoroTask[] }) => void
    ) => () => void;
    timer: {
      get: () => Promise<PomodoroTimerState | null>;
      start: (serviceId: string, taskId: string | null) => Promise<PomodoroTimerState | null>;
      pause: () => Promise<PomodoroTimerState | null>;
      resume: () => Promise<PomodoroTimerState | null>;
      skip: () => Promise<PomodoroTimerState | null>;
      stop: () => Promise<null>;
      onUpdated: (callback: (state: PomodoroTimerState | null) => void) => () => void;
    };
  };
  messengerAutomation: {
    start: (serviceId: string, spec: TaskSpec) => Promise<StartResult>;
    stop: (taskId: string) => Promise<AutomationTask[]>;
    stopAll: (serviceId: string) => Promise<AutomationTask[]>;
    list: () => Promise<AutomationTask[]>;
    setAutoStop: (serviceId: string, minutes: number | null) => Promise<AutoStopResult>;
    getAutoStop: (serviceId: string) => Promise<AutoStopState | null>;
    setSplitOpen: (open: boolean) => void;
    onUpdated: (callback: (tasks: AutomationTask[]) => void) => () => void;
    onNotice: (
      callback: (data: { serviceId: string; reason: NoticeReason }) => void
    ) => () => void;
    onAutoStopUpdated: (callback: (data: AutoStopUpdate) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
