import { contextBridge, ipcRenderer } from "electron";

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

const api = {
  // Service CRUD
  getServices: (): Promise<Service[]> => ipcRenderer.invoke("get-services"),
  addService: (service: Service): Promise<Service[]> =>
    ipcRenderer.invoke("add-service", service),
  removeService: (serviceId: string): Promise<Service[]> =>
    ipcRenderer.invoke("remove-service", serviceId),
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
  showService: (serviceId: string): void =>
    ipcRenderer.send("show-service", serviceId),
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
    const handler = (_event: Electron.IpcRendererEvent, data: { action: string; serviceId: string }) => callback(data);
    ipcRenderer.on("context-menu-action", handler);
    return () => ipcRenderer.removeListener("context-menu-action", handler);
  },
  onServiceSwitched: (callback: (serviceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, serviceId: string) => callback(serviceId);
    ipcRenderer.on("service-switched", handler);
    return () => ipcRenderer.removeListener("service-switched", handler);
  },
  reloadService: (serviceId: string): void =>
    ipcRenderer.send("reload-service", serviceId),
  goBack: (serviceId: string): void =>
    ipcRenderer.send("go-back", serviceId),
  goForward: (serviceId: string): void =>
    ipcRenderer.send("go-forward", serviceId),

  // Link preview
  closeLinkPreview: (): void => ipcRenderer.send("close-link-preview"),
  openLinkExternal: (url: string): void =>
    ipcRenderer.send("open-link-external", url),
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

  // Window controls
  minimize: (): void => ipcRenderer.send("window-minimize"),
  maximize: (): void => ipcRenderer.send("window-maximize"),
  close: (): void => ipcRenderer.send("window-close"),

  // Events
  onNotificationUpdate: (
    callback: (data: { serviceId: string; count: number }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { serviceId: string; count: number }) =>
      callback(data);
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
  selectDownloadFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("select-download-folder"),

  // Custom icons
  saveCustomIcon: (fileName: string, dataUrl: string): Promise<string> =>
    ipcRenderer.invoke("save-custom-icon", { fileName, dataUrl }),
  deleteCustomIcon: (fileName: string): Promise<void> =>
    ipcRenderer.invoke("delete-custom-icon", fileName),

  // Updates
  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string; downloadUrl?: string }> => ipcRenderer.invoke("check-for-updates"),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
  downloadAndInstallUpdate: (downloadUrl: string): Promise<void> => ipcRenderer.invoke("download-and-install-update", downloadUrl),
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { percent: number }) => callback(info);
    ipcRenderer.on("update-download-progress", handler);
    return () => ipcRenderer.removeListener("update-download-progress", handler);
  },
  onDownloadComplete: (callback: (fileName: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fileName: string) => callback(fileName);
    ipcRenderer.on("download-complete", handler);
    return () => ipcRenderer.removeListener("download-complete", handler);
  },

  // Messenger automation
  messengerAutomation: {
    start: (serviceId: string, spec: TaskSpec): Promise<StartResult> =>
      ipcRenderer.invoke("messenger-automation-start", serviceId, spec),
    stop: (taskId: string): Promise<AutomationTask[]> =>
      ipcRenderer.invoke("messenger-automation-stop", taskId),
    stopAll: (serviceId: string): Promise<AutomationTask[]> =>
      ipcRenderer.invoke("messenger-automation-stop-all", serviceId),
    list: (): Promise<AutomationTask[]> =>
      ipcRenderer.invoke("messenger-automation-list"),
    setSplitOpen: (open: boolean): void =>
      ipcRenderer.send("set-automation-split", open),
    onUpdated: (callback: (tasks: AutomationTask[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tasks: AutomationTask[]) =>
        callback(tasks);
      ipcRenderer.on("messenger-automation-updated", handler);
      return () => ipcRenderer.removeListener("messenger-automation-updated", handler);
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
