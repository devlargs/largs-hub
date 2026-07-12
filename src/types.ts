export interface AppSettings {
  downloadFolder: string;
  wakeServicesAutomatically: boolean;
  launchAtStartup: boolean;
  openFolderOnFinish: boolean;
  openFileOnFinish: boolean;
  downloadAlertOnFinish: boolean;
  // Minutes an inactive service may idle before its view is hibernated (0 = off)
  hibernateInactiveMinutes: number;
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
  // Internal services (e.g. "notion-notes") render as React pages instead of
  // getting a WebContentsView in the main process
  type?: "notion-notes";
}

export interface NotionNoteItem {
  text: string;
  checked: boolean;
}

export interface NotionNote {
  id: string;
  title: string;
  kind: "text" | "list";
  text: string;
  items: NotionNoteItem[];
  imageUrl?: string;
  pinned: boolean;
  editedAt: string;
}

export type NotionNoteImage =
  | { action: "keep" }
  | { action: "remove" }
  | { action: "upload"; fileName: string; mimeType: string; base64: string };

export interface NotionNoteInput {
  title: string;
  kind: "text" | "list";
  text: string;
  items: NotionNoteItem[];
  pinned: boolean;
  image?: NotionNoteImage;
}

export type NotionNotesState = "none" | "pending" | "ready";

export interface NotionNotesResult {
  ok: boolean;
  error?: string;
}

export interface NotionNoteResult extends NotionNotesResult {
  note?: NotionNote;
}

export interface NotionNotesListResult extends NotionNotesResult {
  notes?: NotionNote[];
}

export interface NotionConnectResult extends NotionNotesResult {
  needsReset?: boolean;
}

export type TaskSpec =
  | { type: "sendChat"; message: string; time: string }
  | { type: "sendChatInterval"; message: string; fromSec: number; toSec: number }
  | { type: "sendChatMessage"; message: string }
  | { type: "sendEmoji"; emoji: string; fromSec: number; toSec: number; maxLength: number }
  | { type: "startCallCycle"; waitSeconds: number };

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
  notionNotes: {
    getState: (serviceId: string) => Promise<NotionNotesState>;
    connect: (serviceId: string, apiKey: string, databaseId: string) => Promise<NotionConnectResult>;
    resetDatabase: (serviceId: string) => Promise<NotionNotesResult>;
    disconnect: (serviceId: string) => Promise<void>;
    list: (serviceId: string) => Promise<NotionNotesListResult>;
    create: (serviceId: string, input: NotionNoteInput) => Promise<NotionNoteResult>;
    update: (serviceId: string, noteId: string, input: NotionNoteInput) => Promise<NotionNoteResult>;
    setPinned: (serviceId: string, noteId: string, pinned: boolean) => Promise<NotionNoteResult>;
    remove: (serviceId: string, noteId: string) => Promise<NotionNotesResult>;
  };
  messengerAutomation: {
    start: (serviceId: string, spec: TaskSpec) => Promise<StartResult>;
    stop: (taskId: string) => Promise<AutomationTask[]>;
    stopAll: (serviceId: string) => Promise<AutomationTask[]>;
    list: () => Promise<AutomationTask[]>;
    setSplitOpen: (open: boolean) => void;
    onUpdated: (callback: (tasks: AutomationTask[]) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
