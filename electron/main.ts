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

app.setName("Largs Hub");

let mainWindow: BrowserWindow | null = null;
const serviceViews = new Map<string, WebContentsView>();
const notificationCounts = new Map<string, number>();
let activeServiceId: string | null = null;
const pendingDecrease = new Map<string, { count: number; streak: number }>();
const DECREASE_THRESHOLD = 3; // require 3 consecutive lower readings before decreasing
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

  mainWindow.maximize();

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

  // Pre-load all saved services so they're warm on startup
  mainWindow.webContents.on("did-finish-load", () => {
    const services = store.get("services");
    for (const service of services) {
      if (!serviceViews.has(service.id) && mainWindow) {
        const view = createServiceView(service);
        serviceViews.set(service.id, view);
        mainWindow.contentView.addChildView(view);
        view.setVisible(false);
      }
    }
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

function updateTaskbarBadge() {
  if (!mainWindow) return;
  let total = 0;
  for (const count of notificationCounts.values()) {
    total += count;
  }
  if (total > 0) {
    mainWindow.setOverlayIcon(
      createBadgeIcon(total),
      `${total} notifications`,
    );
  } else {
    mainWindow.setOverlayIcon(null, "");
  }
}

function createBadgeIcon(count: number): Electron.NativeImage {
  const text = count > 99 ? "99+" : String(count);
  // Use an offscreen BrowserWindow to render badge as PNG
  // For simplicity, create a data URL PNG via SVG → img conversion isn't available,
  // so we'll use Electron's built-in approach with a simple colored square
  const size = 16;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ef4444"/>
    <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central"
      font-family="Arial" font-size="${text.length > 2 ? 7 : text.length > 1 ? 8 : 10}" font-weight="bold" fill="white">${text}</text>
  </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return nativeImage.createFromDataURL(dataUrl);
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
  // Debounce decreases to avoid blinking badges during page transitions
  const updateNotificationCount = (count: number) => {
    const prev = notificationCounts.get(service.id) || 0;
    if (count === prev) {
      pendingDecrease.delete(service.id);
      return;
    }

    if (count < prev) {
      const pending = pendingDecrease.get(service.id);
      if (pending && pending.count === count) {
        pending.streak++;
        if (pending.streak < DECREASE_THRESHOLD) return;
      } else {
        pendingDecrease.set(service.id, { count, streak: 1 });
        return;
      }
      pendingDecrease.delete(service.id);
    } else {
      pendingDecrease.delete(service.id);
    }

    notificationCounts.set(service.id, count);
    updateTaskbarBadge();
    if (mainWindow) {
      mainWindow.webContents.send("notification-update", {
        serviceId: service.id,
        count,
      });
    }
  };

  view.webContents.on("page-title-updated", (_event, title) => {
    const match = title.match(/\((\d+)\)/);
    const count = match ? parseInt(match[1], 10) : 0;
    updateNotificationCount(count);
  });

  // Poll for unread count (title-based + DOM-based for apps like WhatsApp)
  const pollInterval = setInterval(() => {
    if (view.webContents.isDestroyed()) {
      clearInterval(pollInterval);
      return;
    }

    // Try title-based detection first
    view.webContents.executeJavaScript(`
      (() => {
        // Check page title for (N) pattern
        const titleMatch = document.title.match(/\\((\\d+)\\)/);
        if (titleMatch) return parseInt(titleMatch[1], 10);

        // Check for "Unread N" text in the page (e.g. WhatsApp filter button)
        const allText = document.body.innerText || "";
        const unreadTabMatch = allText.match(/Unread\\s+(\\d+)/i);
        if (unreadTabMatch) return parseInt(unreadTabMatch[1], 10);

        // Count elements with aria-label containing "unread" (case-insensitive)
        const allElements = document.querySelectorAll('[aria-label]');
        let unreadTotal = 0;
        allElements.forEach(el => {
          if (el.getAttribute('aria-label').toLowerCase().includes('unread')) {
            const num = parseInt(el.textContent || "0", 10);
            unreadTotal += num > 0 ? num : 1;
          }
        });
        if (unreadTotal > 0) return unreadTotal;

        // Messenger: count chat rows with unread delivery status indicators
        const messengerUnread = document.querySelectorAll('[data-testid="unread-indicator"], [aria-label*="Delivered"], [aria-label*="Sent"]');
        if (messengerUnread.length === 0) {
          // Fallback: count bold/unread chat previews in Messenger
          // Messenger marks unread chat names with heavier font weight
          const chatRows = document.querySelectorAll('[role="row"], [role="listitem"]');
          let boldCount = 0;
          chatRows.forEach(row => {
            const spans = row.querySelectorAll('span');
            spans.forEach(span => {
              const weight = window.getComputedStyle(span).fontWeight;
              if ((weight === 'bold' || parseInt(weight) >= 700) && span.textContent && span.textContent.trim().length > 0 && span.closest('[role="row"], [role="listitem"]') === row) {
                // Check if this row also has a small colored dot (unread indicator)
                const dots = row.querySelectorAll('span[data-visualcompletion="ignore"]');
                if (dots.length > 0) boldCount++;
              }
            });
          });
          if (boldCount > 0) return boldCount;
        }

        return 0;
      })()
    `, true)
      .then((count: number) => {
        updateNotificationCount(count);
      })
      .catch(() => {});
  }, 5000);

  // Handle popups: navigate in-app for known domains, open external for others
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const serviceHost = new URL(service.url).hostname.replace(/^www\./, "");
      const popupHost = parsed.hostname.replace(/^www\./, "");

      const isServiceDomain = popupHost.endsWith(serviceHost) || serviceHost.endsWith(popupHost);

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

      const isAllowed = allowedDomains.some((d) => popupHost === d || popupHost.endsWith("." + d));

      if (isServiceDomain || isAllowed) {
        // Navigate the current view instead of opening a popup window
        view.webContents.loadURL(url);
        return { action: "deny" };
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
  notificationCounts.delete(serviceId);
  updateTaskbarBadge();

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

// Update check via GitHub API
ipcMain.handle("check-for-updates", async () => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/devlargs/largs-hub/releases/latest",
    );
    if (!response.ok) return { updateAvailable: false };
    const data = await response.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    const current = app.getVersion();
    if (latest && latest !== current) {
      const downloadUrl = data.assets?.find(
        (a: { name: string }) => a.name.endsWith(".exe") && !a.name.endsWith(".blockmap"),
      )?.browser_download_url;
      return { updateAvailable: true, version: latest, downloadUrl };
    }
    return { updateAvailable: false };
  } catch {
    return { updateAvailable: false };
  }
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("download-and-install-update", async (_event, downloadUrl: string) => {
  const fs = require("fs");
  const https = require("https");
  const http = require("http");
  const tmpPath = path.join(app.getPath("temp"), "largs-hub-update.exe");

  return new Promise<void>((resolve, reject) => {
    const follow = (url: string) => {
      const mod = url.startsWith("https") ? https : http;
      mod.get(url, { headers: { "User-Agent": "Largs-Hub-Updater" } }, (res: any) => {
        // Follow redirects (GitHub uses 302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        const file = fs.createWriteStream(tmpPath);

        res.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          if (totalBytes > 0 && mainWindow) {
            mainWindow.webContents.send("update-download-progress", {
              percent: Math.round((downloaded / totalBytes) * 100),
            });
          }
        });

        res.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            // Launch the installer silently, then relaunch the app
            const { exec } = require("child_process");
            const appPath = process.execPath;
            exec(`"${tmpPath}" /S && "${appPath}"`, {
              detached: true,
              windowsHide: true,
            });
            app.quit();
            resolve();
          });
        });

        file.on("error", (err: Error) => {
          fs.unlink(tmpPath, () => {});
          reject(err);
        });
      }).on("error", reject);
    };

    follow(downloadUrl);
  });
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
