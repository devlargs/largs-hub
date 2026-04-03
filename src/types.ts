export interface AppSettings {
  downloadFolder: string;
  wakeServicesAutomatically: boolean;
  launchAtStartup: boolean;
  openFolderOnFinish: boolean;
  openFileOnFinish: boolean;
  downloadAlertOnFinish: boolean;
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
  downloadAndInstallUpdate: (downloadUrl: string) => Promise<void>;
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => () => void;
  onDownloadComplete: (callback: (fileName: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
