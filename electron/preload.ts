import { contextBridge, ipcRenderer } from "electron";

export interface Service {
  id: string;
  name: string;
  url: string;
  icon: string;
  color: string;
  notificationCount: number;
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

  // View management
  showService: (serviceId: string): void =>
    ipcRenderer.send("show-service", serviceId),
  hideService: (): Promise<void> => ipcRenderer.invoke("hide-service"),
  setActiveViewVisible: (visible: boolean): void =>
    ipcRenderer.send("set-active-view-visible", visible),
  reloadService: (serviceId: string): void =>
    ipcRenderer.send("reload-service", serviceId),
  goBack: (serviceId: string): void =>
    ipcRenderer.send("go-back", serviceId),
  goForward: (serviceId: string): void =>
    ipcRenderer.send("go-forward", serviceId),

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

  // System stats
  startSystemStats: () => ipcRenderer.send("start-system-stats"),
  stopSystemStats: () => ipcRenderer.send("stop-system-stats"),
  onSystemStats: (callback: (stats: { cpu: number; memUsed: number; memTotal: number; appMem: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, stats: { cpu: number; memUsed: number; memTotal: number; appMem: number }) => callback(stats);
    ipcRenderer.on("system-stats", handler);
    return () => ipcRenderer.removeListener("system-stats", handler);
  },

  // Updates
  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string; downloadUrl?: string }> => ipcRenderer.invoke("check-for-updates"),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open-external", url),
};

contextBridge.exposeInMainWorld("electronAPI", api);
