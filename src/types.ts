export interface Service {
  id: string;
  name: string;
  url: string;
  icon: string;
  color: string;
  notificationCount: number;
}

export interface SystemStats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  appMem: number;
}

export interface ElectronAPI {
  getServices: () => Promise<Service[]>;
  addService: (service: Service) => Promise<Service[]>;
  removeService: (serviceId: string) => Promise<Service[]>;
  updateService: (service: Service) => Promise<Service[]>;
  reorderServices: (serviceIds: string[]) => Promise<Service[]>;
  showService: (serviceId: string) => void;
  hideService: () => Promise<void>;
  setActiveViewVisible: (visible: boolean) => void;
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
  startSystemStats: () => void;
  stopSystemStats: () => void;
  onSystemStats: (callback: (stats: SystemStats) => void) => () => void;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  startUpdateDownload: () => void;
  installUpdate: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
