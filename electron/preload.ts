import { contextBridge, ipcRenderer } from "electron";
import type {
  AutoStopResult,
  AutoStopState,
  AutomationPrefs,
  AutoStopUpdate,
  AutomationTask,
  ListGroupsResult,
  MessageListGroup,
  NoticeReason,
  SecurityResult,
  SecurityState,
  SecurityUpdate,
  Service,
  StartResult,
  TaskSpec,
} from "./shared/types";

// The bridge's payload types are the shared declarations the main process and
// the renderer use — no third copy to keep in step (issue #82).

const api = {
  // Service CRUD
  getServices: (): Promise<Service[]> => ipcRenderer.invoke("get-services"),
  getLastActiveService: (): Promise<string | null> => ipcRenderer.invoke("get-last-active-service"),
  getNotificationCounts: (): Promise<Record<string, number>> =>
    ipcRenderer.invoke("get-notification-counts"),
  addService: (service: Service): Promise<Service[]> => ipcRenderer.invoke("add-service", service),
  removeService: (serviceId: string): Promise<Service[]> =>
    ipcRenderer.invoke("remove-service", serviceId),
  clearServiceData: (serviceId: string): Promise<void> =>
    ipcRenderer.invoke("clear-service-data", serviceId),
  updateService: (service: Service): Promise<Service[]> =>
    ipcRenderer.invoke("update-service", service),
  reorderServices: (serviceIds: string[]): Promise<Service[]> =>
    ipcRenderer.invoke("reorder-services", serviceIds),
  toggleMuteService: (serviceId: string): Promise<Service[]> =>
    ipcRenderer.invoke("toggle-mute-service", serviceId),
  toggleServiceEnabled: (serviceId: string): Promise<Service[]> =>
    ipcRenderer.invoke("toggle-service-enabled", serviceId),
  toggleServiceNotifications: (serviceId: string): Promise<Service[]> =>
    ipcRenderer.invoke("toggle-service-notifications", serviceId),

  // View management
  showService: (serviceId: string): void => ipcRenderer.send("show-service", serviceId),
  hideService: (): Promise<void> => ipcRenderer.invoke("hide-service"),
  bringUiToFront: (): void => ipcRenderer.send("bring-ui-to-front"),
  sendUiToBack: (): void => ipcRenderer.send("send-ui-to-back"),
  showServiceContextMenu: (serviceId: string): void =>
    ipcRenderer.send("show-service-context-menu", serviceId),
  showSettingsMenu: (): void => ipcRenderer.send("show-settings-menu"),
  onServicesUpdated: (callback: (services: Service[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, services: Service[]) => callback(services);
    ipcRenderer.on("services-updated", handler);
    return () => ipcRenderer.removeListener("services-updated", handler);
  },
  onContextMenuAction: (callback: (data: { action: string; serviceId: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { action: string; serviceId: string },
    ) => callback(data);
    ipcRenderer.on("context-menu-action", handler);
    return () => ipcRenderer.removeListener("context-menu-action", handler);
  },
  onServiceSwitched: (callback: (serviceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, serviceId: string) => callback(serviceId);
    ipcRenderer.on("service-switched", handler);
    return () => ipcRenderer.removeListener("service-switched", handler);
  },
  onShortcutHintsChanged: (callback: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on("shortcut-hints-changed", handler);
    return () => ipcRenderer.removeListener("shortcut-hints-changed", handler);
  },
  reloadService: (serviceId: string): void => ipcRenderer.send("reload-service", serviceId),
  goBack: (serviceId: string): void => ipcRenderer.send("go-back", serviceId),
  goForward: (serviceId: string): void => ipcRenderer.send("go-forward", serviceId),

  // Find in page (service views)
  setFindBarOpen: (open: boolean): void => ipcRenderer.send("set-find-bar-open", open),
  findInPage: (serviceId: string, text: string, forward: boolean, findNext: boolean): void =>
    ipcRenderer.send("find-in-page", { serviceId, text, forward, findNext }),
  stopFindInPage: (serviceId: string): void => ipcRenderer.send("stop-find-in-page", serviceId),
  onFindResults: (
    callback: (data: { serviceId: string; matches: number; activeMatchOrdinal: number }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { serviceId: string; matches: number; activeMatchOrdinal: number },
    ) => callback(data);
    ipcRenderer.on("find-results", handler);
    return () => ipcRenderer.removeListener("find-results", handler);
  },
  onOpenFindBar: (callback: (serviceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, serviceId: string) => callback(serviceId);
    ipcRenderer.on("open-find-bar", handler);
    return () => ipcRenderer.removeListener("open-find-bar", handler);
  },
  onCloseFindBar: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("close-find-bar", handler);
    return () => ipcRenderer.removeListener("close-find-bar", handler);
  },

  // Zoom (per service, persisted)
  getServiceZoom: (serviceId: string): Promise<number> =>
    ipcRenderer.invoke("get-service-zoom", serviceId),
  setServiceZoom: (serviceId: string, factor: number): void =>
    ipcRenderer.send("set-service-zoom", { serviceId, factor }),
  stepServiceZoom: (serviceId: string, direction: "in" | "out" | "reset"): void =>
    ipcRenderer.send("step-service-zoom", { serviceId, direction }),
  onServiceZoomChanged: (callback: (data: { serviceId: string; factor: number }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { serviceId: string; factor: number },
    ) => callback(data);
    ipcRenderer.on("service-zoom-changed", handler);
    return () => ipcRenderer.removeListener("service-zoom-changed", handler);
  },

  // Saved message lists (global, shared by every Messenger service)
  listGroups: {
    list: (): Promise<MessageListGroup[]> => ipcRenderer.invoke("get-list-groups"),
    add: (group: MessageListGroup): Promise<ListGroupsResult> =>
      ipcRenderer.invoke("add-list-group", group),
    update: (group: MessageListGroup): Promise<ListGroupsResult> =>
      ipcRenderer.invoke("update-list-group", group),
    remove: (groupId: string): Promise<ListGroupsResult> =>
      ipcRenderer.invoke("remove-list-group", groupId),
  },

  // Link preview
  closeLinkPreview: (): void => ipcRenderer.send("close-link-preview"),
  openLinkExternal: (url: string): void => ipcRenderer.send("open-link-external", url),
  onLinkPreviewOpen: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on("link-preview-open", handler);
    return () => ipcRenderer.removeListener("link-preview-open", handler);
  },
  onLinkPreviewClosed: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("link-preview-closed", handler);
    return () => ipcRenderer.removeListener("link-preview-closed", handler);
  },
  onLinkPreviewNavigated: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on("link-preview-navigated", handler);
    return () => ipcRenderer.removeListener("link-preview-navigated", handler);
  },

  // Window controls. macOS uses its native traffic lights instead of the
  // custom buttons, so the titlebar needs to know which platform it's on.
  platform: process.platform,
  minimize: (): void => ipcRenderer.send("window-minimize"),
  maximize: (): void => ipcRenderer.send("window-maximize"),
  close: (): void => ipcRenderer.send("window-close"),

  // Events
  onNotificationUpdate: (callback: (data: { serviceId: string; count: number }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { serviceId: string; count: number },
    ) => callback(data);
    ipcRenderer.on("notification-update", handler);
    return () => ipcRenderer.removeListener("notification-update", handler);
  },

  // Theme
  getTheme: (): Promise<"dark" | "light"> => ipcRenderer.invoke("get-theme"),
  setTheme: (theme: "dark" | "light"): Promise<void> => ipcRenderer.invoke("set-theme", theme),

  // Settings
  getSettings: (): Promise<{ downloadFolder: string; wakeServicesAutomatically: boolean }> =>
    ipcRenderer.invoke("get-settings"),
  updateSetting: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke("update-setting", key, value),
  selectDownloadFolder: (): Promise<string | null> => ipcRenderer.invoke("select-download-folder"),

  // Security controls (workspace lock). The stored credential stays in the main
  // process — the bridge only carries passwords in, and never back out.
  security: {
    getState: (): Promise<SecurityState> => ipcRenderer.invoke("get-security-state"),
    // Turning it off needs the current password (issue #111)
    setEnabled: (enabled: boolean, currentPassword?: string): Promise<SecurityUpdate> =>
      ipcRenderer.invoke("set-security-enabled", enabled, currentPassword),
    setLockDelay: (minutes: number): Promise<SecurityState> =>
      ipcRenderer.invoke("set-lock-delay", minutes),
    setPassword: (payload: {
      currentPassword?: string;
      password: string;
      confirm: string;
    }): Promise<SecurityResult> => ipcRenderer.invoke("set-master-password", payload),
    unlock: (password: string): Promise<SecurityResult> =>
      ipcRenderer.invoke("unlock-app", password),
    onStateChanged: (callback: (state: SecurityState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: SecurityState) => callback(state);
      ipcRenderer.on("security-state-changed", handler);
      return () => ipcRenderer.removeListener("security-state-changed", handler);
    },
  },

  // Custom icons
  saveCustomIcon: (fileName: string, dataUrl: string): Promise<string> =>
    ipcRenderer.invoke("save-custom-icon", { fileName, dataUrl }),
  deleteCustomIcon: (fileName: string): Promise<void> =>
    ipcRenderer.invoke("delete-custom-icon", fileName),

  // Updates
  checkForUpdates: (): Promise<{
    updateAvailable: boolean;
    version?: string;
    downloadUrl?: string;
  }> => ipcRenderer.invoke("check-for-updates"),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
  downloadAndInstallUpdate: (): Promise<void> => ipcRenderer.invoke("download-and-install-update"),
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { percent: number }) =>
      callback(info);
    ipcRenderer.on("update-download-progress", handler);
    return () => ipcRenderer.removeListener("update-download-progress", handler);
  },
  onDownloadComplete: (callback: (fileName: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fileName: string) => callback(fileName);
    ipcRenderer.on("download-complete", handler);
    return () => ipcRenderer.removeListener("download-complete", handler);
  },

  messengerAutomation: {
    start: (serviceId: string, spec: TaskSpec): Promise<StartResult> =>
      ipcRenderer.invoke("messenger-automation-start", serviceId, spec),
    stop: (taskId: string): Promise<AutomationTask[]> =>
      ipcRenderer.invoke("messenger-automation-stop", taskId),
    stopAll: (serviceId: string): Promise<AutomationTask[]> =>
      ipcRenderer.invoke("messenger-automation-stop-all", serviceId),
    list: (): Promise<AutomationTask[]> => ipcRenderer.invoke("messenger-automation-list"),
    setAutoStop: (serviceId: string, minutes: number | null): Promise<AutoStopResult> =>
      ipcRenderer.invoke("messenger-automation-set-auto-stop", serviceId, minutes),
    getAutoStop: (serviceId: string): Promise<AutoStopState | null> =>
      ipcRenderer.invoke("messenger-automation-get-auto-stop", serviceId),
    getPrefs: (serviceId: string): Promise<AutomationPrefs> =>
      ipcRenderer.invoke("messenger-automation-get-prefs", serviceId),
    savePrefs: (serviceId: string, prefs: AutomationPrefs): Promise<void> =>
      ipcRenderer.invoke("messenger-automation-save-prefs", serviceId, prefs),
    setSplitOpen: (open: boolean): void => ipcRenderer.send("set-automation-split", open),
    getSplitWidth: (): Promise<number> => ipcRenderer.invoke("get-automation-split-width"),
    onSplitWidthChanged: (callback: (width: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, width: number) => callback(width);
      ipcRenderer.on("automation-split-width", handler);
      return () => ipcRenderer.removeListener("automation-split-width", handler);
    },
    getRecentEmojis: (): Promise<string[]> =>
      ipcRenderer.invoke("messenger-automation-recent-emojis"),
    onRecentEmojisUpdated: (callback: (emojis: string[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, emojis: string[]) => callback(emojis);
      ipcRenderer.on("messenger-automation-recent-emojis", handler);
      return () => ipcRenderer.removeListener("messenger-automation-recent-emojis", handler);
    },
    onUpdated: (callback: (tasks: AutomationTask[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tasks: AutomationTask[]) =>
        callback(tasks);
      ipcRenderer.on("messenger-automation-updated", handler);
      return () => ipcRenderer.removeListener("messenger-automation-updated", handler);
    },
    onMissed: (callback: (tasks: AutomationTask[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tasks: AutomationTask[]) =>
        callback(tasks);
      ipcRenderer.on("messenger-automation-missed", handler);
      return () => ipcRenderer.removeListener("messenger-automation-missed", handler);
    },
    onNotice: (callback: (data: { serviceId: string; reason: NoticeReason }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { serviceId: string; reason: NoticeReason },
      ) => callback(data);
      ipcRenderer.on("messenger-automation-notice", handler);
      return () => ipcRenderer.removeListener("messenger-automation-notice", handler);
    },
    onAutoStopUpdated: (callback: (data: AutoStopUpdate) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: AutoStopUpdate) => callback(data);
      ipcRenderer.on("messenger-automation-auto-stop-updated", handler);
      return () => ipcRenderer.removeListener("messenger-automation-auto-stop-updated", handler);
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
