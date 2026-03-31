import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  nativeImage,
} from "electron";
import path from "path";
import os from "os";
import Store from "electron-store";
import { autoUpdater } from "electron-updater";

interface Service {
  id: string;
  name: string;
  url: string;
  icon: string;
  color: string;
  notificationCount: number;
}

interface StoreSchema {
  services: Service[];
  sidebarWidth: number;
  windowBounds: { width: number; height: number; x?: number; y?: number };
  theme: "dark" | "light";
}

const store = new Store<StoreSchema>({
  defaults: {
    services: [],
    sidebarWidth: 68,
    windowBounds: { width: 1200, height: 800 },
    theme: "dark",
  },
});

let mainWindow: BrowserWindow | null = null;
const serviceViews = new Map<string, WebContentsView>();
let activeServiceId: string | null = null;
const SIDEBAR_WIDTH = 68;
const TITLEBAR_HEIGHT = 46;

function createWindow() {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 0,
    minHeight: 0,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#181825",
    icon: path.join(__dirname, "../assets/ico/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (
    process.env.NODE_ENV === "development" ||
    process.argv.includes("--dev")
  ) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("resize", () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      store.set("windowBounds", {
        ...store.get("windowBounds"),
        width,
        height,
      });
      repositionActiveView();
    }
  });

  mainWindow.on("move", () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      store.set("windowBounds", { ...store.get("windowBounds"), x, y });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    serviceViews.clear();
  });
}

function getViewBounds() {
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: TITLEBAR_HEIGHT, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  return {
    x: SIDEBAR_WIDTH,
    y: TITLEBAR_HEIGHT,
    width: Math.max(0, width - SIDEBAR_WIDTH),
    height: Math.max(0, height - TITLEBAR_HEIGHT),
  };
}

function repositionActiveView() {
  if (!activeServiceId) return;
  const view = serviceViews.get(activeServiceId);
  if (view) {
    view.setBounds(getViewBounds());
  }
}

function createServiceView(service: Service): WebContentsView {
  const partition = `persist:service-${service.id}`;

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#00000000");

  // Spoof user agent so sites like Google and WhatsApp don't reject Electron
  const chromeVersion = process.versions.chrome;
  const spoofedUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  view.webContents.setUserAgent(spoofedUA);

  // Also set at session level so OAuth popups inherit the spoofed UA
  view.webContents.session.setUserAgent(spoofedUA);

  view.webContents.loadURL(service.url);

  // Track page title changes for notification detection
  view.webContents.on("page-title-updated", (_event, title) => {
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1], 10) : 0;
    if (mainWindow) {
      mainWindow.webContents.send("notification-update", {
        serviceId: service.id,
        count,
      });
    }
  });

  // Handle popups: allow same-service and auth flows in-app, open truly external links in browser
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const serviceHost = new URL(service.url).hostname.replace(/^www\./, "");
      const popupHost = parsed.hostname.replace(/^www\./, "");

      // Allow if same domain as the service
      if (popupHost.endsWith(serviceHost) || serviceHost.endsWith(popupHost)) {
        return { action: "allow" };
      }

      // Allow common auth/login providers
      const allowedDomains = [
        "google.com", "googleapis.com", "gstatic.com",
        "facebook.com", "fbcdn.net", "messenger.com",
        "apple.com", "icloud.com",
        "microsoft.com", "live.com", "microsoftonline.com",
        "github.com",
        "slack.com",
        "discord.com", "discordapp.com",
        "telegram.org",
        "linkedin.com",
        "twitter.com", "x.com",
        "notion.so", "notion-static.com",
        "reddit.com", "redditstatic.com",
        "whatsapp.com", "whatsapp.net",
      ];

      if (allowedDomains.some((d) => popupHost === d || popupHost.endsWith("." + d))) {
        return { action: "allow" };
      }
    } catch {}

    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  return view;
}

function showService(serviceId: string) {
  if (!mainWindow) return;

  // Hide current view
  if (activeServiceId) {
    const currentView = serviceViews.get(activeServiceId);
    if (currentView) {
      currentView.setVisible(false);
    }
  }

  // Show or create requested view
  let view = serviceViews.get(serviceId);
  if (!view) {
    const services = store.get("services");
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    view = createServiceView(service);
    serviceViews.set(serviceId, view);
    mainWindow.contentView.addChildView(view);
  }

  view.setVisible(true);
  view.setBounds(getViewBounds());
  activeServiceId = serviceId;
}

function hideActiveService() {
  if (!mainWindow || !activeServiceId) return;
  const currentView = serviceViews.get(activeServiceId);
  if (currentView) {
    currentView.setVisible(false);
  }
  activeServiceId = null;
}

// IPC Handlers
ipcMain.handle("get-services", () => {
  return store.get("services");
});

ipcMain.handle("add-service", (_event, service: Service) => {
  const services = store.get("services");
  services.push(service);
  store.set("services", services);
  return services;
});

ipcMain.handle("remove-service", (_event, serviceId: string) => {
  const services = store.get("services").filter((s) => s.id !== serviceId);
  store.set("services", services);

  // Clean up the view
  const view = serviceViews.get(serviceId);
  if (view) {
    if (activeServiceId === serviceId) {
      activeServiceId = null;
    }
    if (mainWindow) {
      mainWindow.contentView.removeChildView(view);
    }
    view.webContents.close();
    serviceViews.delete(serviceId);
  }

  return services;
});

ipcMain.handle("update-service", (_event, updated: Service) => {
  const services = store
    .get("services")
    .map((s) => (s.id === updated.id ? updated : s));
  store.set("services", services);
  return services;
});

ipcMain.handle("reorder-services", (_event, serviceIds: string[]) => {
  const services = store.get("services");
  const reordered = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter(Boolean) as Service[];
  store.set("services", reordered);
  return reordered;
});

ipcMain.on("show-service", (_event, serviceId: string) => {
  showService(serviceId);
});

ipcMain.handle("hide-service", () => {
  hideActiveService();
});

ipcMain.on("set-active-view-visible", (_event, visible: boolean) => {
  if (!activeServiceId) return;
  const view = serviceViews.get(activeServiceId);
  if (view) {
    view.setVisible(visible);
  }
});

ipcMain.on("reload-service", (_event, serviceId: string) => {
  const view = serviceViews.get(serviceId);
  if (view) {
    view.webContents.reload();
  }
});

ipcMain.on("go-back", (_event, serviceId: string) => {
  const view = serviceViews.get(serviceId);
  if (view && view.webContents.canGoBack()) {
    view.webContents.goBack();
  }
});

ipcMain.on("go-forward", (_event, serviceId: string) => {
  const view = serviceViews.get(serviceId);
  if (view && view.webContents.canGoForward()) {
    view.webContents.goForward();
  }
});

// Theme
ipcMain.handle("get-theme", () => store.get("theme"));
ipcMain.handle("set-theme", (_event, theme: "dark" | "light") => {
  store.set("theme", theme);
});

// System stats
let prevCpuTimes: { idle: number; total: number } | null = null;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  if (!prevCpuTimes) {
    prevCpuTimes = { idle, total };
    return 0;
  }
  const idleDiff = idle - prevCpuTimes.idle;
  const totalDiff = total - prevCpuTimes.total;
  prevCpuTimes = { idle, total };
  return totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
}

let systemStatsInterval: ReturnType<typeof setInterval> | null = null;

ipcMain.on("start-system-stats", () => {
  if (systemStatsInterval) return;
  getCpuUsage();

  systemStatsInterval = setInterval(() => {
    if (!mainWindow) return;
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    mainWindow.webContents.send("system-stats", {
      cpu: getCpuUsage(),
      memUsed: Math.round((totalMem - freeMem) / 1024 / 1024),
      memTotal: Math.round(totalMem / 1024 / 1024),
      appMem: Math.round(mem.rss / 1024 / 1024),
    });
  }, 2000);
});

ipcMain.on("stop-system-stats", () => {
  if (systemStatsInterval) {
    clearInterval(systemStatsInterval);
    systemStatsInterval = null;
  }
});

// Auto-update
ipcMain.on("start-update-download", () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("check-for-updates", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      const current = app.getVersion();
      const latest = result.updateInfo.version;
      if (latest !== current) {
        return { updateAvailable: true, version: latest };
      }
    }
    return { updateAvailable: false };
  } catch {
    return { updateAvailable: false };
  }
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// Window controls
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow?.close());

function initAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-available", {
      version: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-download-progress", {
      percent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update-downloaded");
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
  });
}

app.whenReady().then(() => {
  createWindow();

  if (!process.argv.includes("--dev")) {
    initAutoUpdater();
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
