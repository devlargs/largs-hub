// The renderer's view of the preload bridge.
//
// Every domain and IPC payload type comes from the shared module the main
// process uses (electron/shared/types.ts), re-exported here so components can
// keep importing them from "../types". Only ElectronAPI — the shape of
// window.electronAPI, which is a renderer concern — is declared in this file.

export * from "@shared/types";

import type {
  AppSettings,
  AutoStopResult,
  AutoStopState,
  AutoStopUpdate,
  AutomationTask,
  ListGroupsResult,
  MessageListGroup,
  NoticeReason,
  TodoConnectResult,
  TodoConnectionState,
  TodoListResult,
  TodoSyncState,
  TodoTask,
  TodoTaskResult,
  SecurityResult,
  SecurityState,
  Service,
  StartResult,
  TaskSpec,
} from "@shared/types";

export interface ElectronAPI {
  getServices: () => Promise<Service[]>;
  getLastActiveService: () => Promise<string | null>;
  getNotificationCounts: () => Promise<Record<string, number>>;
  addService: (service: Service) => Promise<Service[]>;
  removeService: (serviceId: string) => Promise<Service[]>;
  clearServiceData: (serviceId: string) => Promise<void>;
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
  onContextMenuAction: (
    callback: (data: { action: string; serviceId: string }) => void,
  ) => () => void;
  onServiceSwitched: (callback: (serviceId: string) => void) => () => void;
  reloadService: (serviceId: string) => void;
  goBack: (serviceId: string) => void;
  goForward: (serviceId: string) => void;
  setFindBarOpen: (open: boolean) => void;
  findInPage: (serviceId: string, text: string, forward: boolean, findNext: boolean) => void;
  stopFindInPage: (serviceId: string) => void;
  onFindResults: (
    callback: (data: { serviceId: string; matches: number; activeMatchOrdinal: number }) => void,
  ) => () => void;
  onOpenFindBar: (callback: (serviceId: string) => void) => () => void;
  onCloseFindBar: (callback: () => void) => () => void;
  getServiceZoom: (serviceId: string) => Promise<number>;
  setServiceZoom: (serviceId: string, factor: number) => void;
  stepServiceZoom: (serviceId: string, direction: "in" | "out" | "reset") => void;
  onServiceZoomChanged: (
    callback: (data: { serviceId: string; factor: number }) => void,
  ) => () => void;
  listGroups: {
    list: () => Promise<MessageListGroup[]>;
    add: (group: MessageListGroup) => Promise<ListGroupsResult>;
    update: (group: MessageListGroup) => Promise<ListGroupsResult>;
    remove: (groupId: string) => Promise<ListGroupsResult>;
  };
  closeLinkPreview: () => void;
  openLinkExternal: (url: string) => void;
  onLinkPreviewOpen: (callback: (url: string) => void) => () => void;
  onLinkPreviewClosed: (callback: () => void) => () => void;
  onLinkPreviewNavigated: (callback: (url: string) => void) => () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onNotificationUpdate: (
    callback: (data: { serviceId: string; count: number }) => void,
  ) => () => void;
  getTheme: () => Promise<"dark" | "light">;
  setTheme: (theme: "dark" | "light") => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
  selectDownloadFolder: () => Promise<string | null>;
  security: {
    getState: () => Promise<SecurityState>;
    setEnabled: (enabled: boolean) => Promise<SecurityState>;
    setLockDelay: (minutes: number) => Promise<SecurityState>;
    setPassword: (payload: {
      currentPassword?: string;
      password: string;
      confirm: string;
    }) => Promise<SecurityResult>;
    unlock: (password: string) => Promise<SecurityResult>;
    onStateChanged: (callback: (state: SecurityState) => void) => () => void;
  };
  saveCustomIcon: (fileName: string, dataUrl: string) => Promise<string>;
  deleteCustomIcon: (fileName: string) => Promise<void>;
  checkForUpdates: () => Promise<{
    updateAvailable: boolean;
    version?: string;
    downloadUrl?: string;
  }>;
  getAppVersion: () => Promise<string>;
  downloadAndInstallUpdate: () => Promise<void>;
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => () => void;
  onDownloadComplete: (callback: (fileName: string) => void) => () => void;
  todo: {
    getState: (serviceId: string) => Promise<TodoConnectionState>;
    connect: (serviceId: string, apiKey: string, databaseId: string) => Promise<TodoConnectResult>;
    resetDatabase: (serviceId: string) => Promise<{ ok: boolean; error?: string }>;
    adoptDatabase: (serviceId: string) => Promise<{ ok: boolean; error?: string }>;
    disconnect: (serviceId: string) => Promise<void>;
    databaseUrl: (serviceId: string) => Promise<string | null>;
    list: (serviceId: string, date: string) => Promise<TodoListResult>;
    refresh: (serviceId: string, date: string) => Promise<TodoListResult>;
    create: (serviceId: string, date: string, text: string) => Promise<TodoTaskResult>;
    update: (
      serviceId: string,
      taskId: string,
      patch: { text?: string; done?: boolean },
    ) => Promise<TodoTaskResult>;
    defer: (serviceId: string, taskId: string) => Promise<TodoTaskResult>;
    remove: (serviceId: string, taskId: string) => Promise<TodoTaskResult>;
    reorder: (serviceId: string, date: string, taskIds: string[]) => Promise<TodoTaskResult>;
    syncState: (serviceId: string) => Promise<TodoSyncState | null>;
    retrySync: (serviceId: string) => Promise<TodoSyncState | null>;
    onSyncUpdated: (callback: (state: TodoSyncState) => void) => () => void;
    onTasksUpdated: (
      callback: (data: { serviceId: string; tasks: TodoTask[] }) => void,
    ) => () => void;
  };
  messengerAutomation: {
    start: (serviceId: string, spec: TaskSpec) => Promise<StartResult>;
    stop: (taskId: string) => Promise<AutomationTask[]>;
    stopAll: (serviceId: string) => Promise<AutomationTask[]>;
    list: () => Promise<AutomationTask[]>;
    setAutoStop: (serviceId: string, minutes: number | null) => Promise<AutoStopResult>;
    getAutoStop: (serviceId: string) => Promise<AutoStopState | null>;
    setSplitOpen: (open: boolean) => void;
    getSplitWidth: () => Promise<number>;
    onSplitWidthChanged: (callback: (width: number) => void) => () => void;
    getRecentEmojis: () => Promise<string[]>;
    onRecentEmojisUpdated: (callback: (emojis: string[]) => void) => () => void;
    onUpdated: (callback: (tasks: AutomationTask[]) => void) => () => void;
    onMissed: (callback: (tasks: AutomationTask[]) => void) => () => void;
    onNotice: (callback: (data: { serviceId: string; reason: NoticeReason }) => void) => () => void;
    onAutoStopUpdated: (callback: (data: AutoStopUpdate) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
