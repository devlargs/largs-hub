import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  nativeImage,
} from "electron";
import path from "path";
import Store from "electron-store";

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
}

const store = new Store<StoreSchema>({
  defaults: {
    services: [],
    sidebarWidth: 68,
    windowBounds: { width: 1200, height: 800 },
  },
});

let mainWindow: BrowserWindow | null = null;
const serviceViews = new Map<string, WebContentsView>();
let activeServiceId: string | null = null;
const SIDEBAR_WIDTH = 68;

function createWindow() {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#181825",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("resize", () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      store.set("windowBounds", { ...store.get("windowBounds"), width, height });
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
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: 32, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  return {
    x: SIDEBAR_WIDTH,
    y: 32, // titlebar height
    width: Math.max(0, width - SIDEBAR_WIDTH),
    height: Math.max(0, height - 32),
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

  // Spoof user agent so sites like WhatsApp Web don't reject Electron
  const chromeVersion = process.versions.chrome;
  view.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  );

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

  // Open external links in default browser
  view.webContents.setWindowOpenHandler(({ url }) => {
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
  const services = store.get("services").map((s) =>
    s.id === updated.id ? updated : s
  );
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

app.whenReady().then(createWindow);

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
