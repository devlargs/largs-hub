import { app, BrowserWindow, WebContentsView, ipcMain, net, session, shell } from "electron";
import path from "path";
import { pathToFileURL } from "url";
import { customIconsDir, resolveCustomIconPath, sweepOrphanedIcons } from "./customIcons";
import { store, StoreSchema } from "./store";
import {
  registerMessengerAutomation,
  restoreAutomationState,
  hasAnyAutomation,
} from "./messengerAutomation";
import { registerPomodoro, recordFocusSession } from "./tasks";
import { registerPomodoroTimer, stopTimerForTask, hasRunningTimer } from "./pomodoroTimer";
import { registerUpdater } from "./updater";
import { registerServicesIpc } from "./ipc/services";
import { sweepOrphanedPartitions } from "./partitions";
import { linkPreviewBounds } from "./shared/layout";
import { registerSettingsIpc } from "./ipc/settings";
import { registerListGroupsIpc } from "./ipc/listGroups";
import { addRecentEmoji, sanitizeRecentEmojis } from "./recentEmojis";
import {
  initDownloads,
  repositionDownloadToasts,
  closeAllDownloadToasts,
  setDownloadToastsVisible,
} from "./downloads";
import { initNotificationCounts, refreshTaskbarBadge } from "./notificationCounts";
import {
  initServiceViews,
  getServiceView,
  setActiveViewVisible,
  setAutomationSplitOpen,
  repositionActiveView,
  isAnyServiceAudible,
  pushAutomationWidth,
  handleWindowFocus,
  handleWindowBlur,
  startHibernationSweep,
  stopHibernationSweep,
  preloadServices,
  clearAllViewState,
  monitorCallForAnswer,
  closeCallWindow,
  armAutomationCall,
} from "./serviceViews";
import {
  startIdleShutdown,
  stopIdleShutdown,
  initIdleShutdown,
  trackInputActivity,
  noteActivity,
} from "./idleShutdown";

// Entry point: owns the frameless window and the React UI layer (uiView), the
// link-preview overlay, and z-order IPC. Everything else lives in modules:
//   store.ts              persistent state + stored-shape validation
//   tasks.ts              Pomodoro tasks: local store + optional Notion sync
//   pomodoroTimer.ts      the 25/5 focus timer, bound to one task
//   serviceViews.ts       service view lifecycle, switching, hibernation
//   downloads.ts          per-session download handling + completion toast
//   notificationCounts.ts badge state, debounce, taskbar overlay
//   badge-adapters/       per-service unread-count extraction
//   updater.ts            GitHub release check + installer download
//   ipc/services.ts       service CRUD/toggles/navigation/context menu
//   ipc/settings.ts       theme, settings, custom icons, settings menu
//   idleShutdown.ts       auto-quit after an hour with no user interaction

app.setName("Largs Hub");
// Must match build.appId in package.json — Windows keys taskbar overlays and
// toast notifications off this ID, and a mismatch breaks both silently (#58).
app.setAppUserModelId("com.largshub.app");

let mainWindow: BrowserWindow | null = null;
let uiView: WebContentsView | null = null;
let uiLayerRefCount = 0;
let linkPreviewView: WebContentsView | null = null;

// Window bounds change on every resize/move tick; electron-store writes the
// whole config file synchronously, so coalesce those writes behind a debounce.
let pendingBounds: StoreSchema["windowBounds"] | null = null;
let boundsSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveBoundsDebounced(partial: Partial<StoreSchema["windowBounds"]>) {
  pendingBounds = { ...(pendingBounds ?? store.get("windowBounds")), ...partial };
  if (!boundsSaveTimer) {
    boundsSaveTimer = setTimeout(flushBounds, 500);
  }
}
function flushBounds() {
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  if (pendingBounds) {
    store.set("windowBounds", pendingBounds);
    pendingBounds = null;
  }
}

function createWindow() {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 480,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#181825",
    ...(process.env.NODE_ENV !== "development" && !process.argv.includes("--dev")
      ? { icon: path.join(__dirname, "../assets/ico/icon.ico") }
      : {}),
  });

  // Restore the last window state rather than always maximizing — an
  // auto-update relaunches the app, and coming back maximized when you weren't
  // is the visible symptom (issue #92).
  if (store.get("windowMaximized")) {
    mainWindow.maximize();
  }

  mainWindow.on("maximize", () => store.set("windowMaximized", true));
  mainWindow.on("unmaximize", () => store.set("windowMaximized", false));

  // Create the UI view (React app) as a WebContentsView for z-order control
  uiView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  uiView.setBackgroundColor("#00000000");
  mainWindow.contentView.addChildView(uiView);
  trackInputActivity(uiView.webContents);

  const resizeUiView = () => {
    if (!mainWindow || !uiView) return;
    const [width, height] = mainWindow.getContentSize();
    uiView.setBounds({ x: 0, y: 0, width, height });
  };
  resizeUiView();

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    uiView.webContents.loadURL("http://localhost:5173");
  } else {
    uiView.webContents.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("resize", () => {
    if (mainWindow) {
      noteActivity(); // the user is dragging the window edge
      // While maximized the size is the screen's, not the user's — saving it
      // would leave nothing to restore to on unmaximize.
      if (!mainWindow.isMaximized()) {
        const [width, height] = mainWindow.getSize();
        saveBoundsDebounced({ width, height });
      }
      resizeUiView();
      repositionActiveView();
      pushAutomationWidth(); // the panel follows the window, not a fixed ratio
      if (linkPreviewView) {
        linkPreviewView.setBounds(getLinkPreviewBounds());
      }
      repositionDownloadToasts(); // toasts sit against the window's corner
    }
  });

  mainWindow.on("focus", () => {
    noteActivity(); // the user just switched back to the app
    mainWindow?.flashFrame(false); // Stop taskbar flashing
    handleWindowFocus();
  });

  mainWindow.on("blur", () => {
    handleWindowBlur();
  });

  mainWindow.on("minimize", () => setDownloadToastsVisible(false));
  mainWindow.on("restore", () => {
    repositionDownloadToasts();
    setDownloadToastsVisible(true);
  });

  mainWindow.on("move", () => {
    if (mainWindow) {
      noteActivity(); // the user is dragging the window
      if (!mainWindow.isMaximized()) {
        const [x, y] = mainWindow.getPosition();
        saveBoundsDebounced({ x, y });
      }
      repositionDownloadToasts();
    }
  });

  mainWindow.on("closed", () => {
    flushBounds(); // persist any bounds still buffered by the debounce
    // Toasts are top-level windows; leaving one open would block "window-all-closed"
    closeAllDownloadToasts();
    stopHibernationSweep();
    stopIdleShutdown();
    mainWindow = null;
    uiView = null;
    linkPreviewView = null;
    clearAllViewState();
  });

  startHibernationSweep();
  // Unfinished work blocks the quit — see idleShutdown.ts (issue #73).
  initIdleShutdown({
    getIdleMinutes: () => store.get("idleQuitMinutes"),
    isAnythingAudible: () => isAnyServiceAudible(),
    hasRunningTimer,
    hasPendingAutomation: hasAnyAutomation,
  });
  startIdleShutdown();

  // Pre-load all saved services so they're warm on startup (if enabled)
  uiView.webContents.on("did-finish-load", () => {
    preloadServices();
    refreshTaskbarBadge();
    // Only now do the service views a stored task needs to inject into exist
    // (issue #75). Restoring earlier would tear each task down on its first fire.
    restoreAutomationState();
  });

  // An overlay set before the window is on screen is discarded by Windows
  mainWindow.once("show", () => refreshTaskbarBadge());
  mainWindow.on("restore", () => refreshTaskbarBadge());
}

// Link preview modal: the page renders in a WebContentsView layered on top,
// while the React UI draws the modal chrome (backdrop, header, close button)
// around it. Both sides read the geometry from shared/layout.ts.
function getLinkPreviewBounds() {
  if (!mainWindow) return { x: 0, y: 0, width: 0, height: 0 };
  const [width, height] = mainWindow.getContentSize();
  return linkPreviewBounds(width, height);
}

function openLinkPreview(url: string, partition: string) {
  if (!mainWindow || !uiView) return;
  closeLinkPreview();

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#1e1e2e");
  trackInputActivity(view.webContents);

  const chromeVersion = process.versions.chrome;
  view.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
  );

  // Anything that tries to open a new window goes to the system browser
  view.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    shell.openExternal(popupUrl);
    return { action: "deny" };
  });

  view.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      closeLinkPreview();
    }
  });

  // Keep the URL shown in the modal header up to date
  view.webContents.on("did-navigate", (_event, navUrl) => {
    uiView?.webContents.send("link-preview-navigated", navUrl);
  });

  view.webContents.loadURL(url);
  mainWindow.contentView.addChildView(view);
  view.setBounds(getLinkPreviewBounds());
  linkPreviewView = view;

  uiView.webContents.send("link-preview-open", url);
}

function closeLinkPreview() {
  if (!linkPreviewView) return;
  if (mainWindow) {
    mainWindow.contentView.removeChildView(linkPreviewView);
  }
  linkPreviewView.webContents.close();
  linkPreviewView = null;
  uiView?.webContents.send("link-preview-closed");
}

// --- Module wiring -----------------------------------------------------------

initNotificationCounts({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
  isServiceNotificationsEnabled: (serviceId) =>
    store.get("services").find((s) => s.id === serviceId)?.notificationsEnabled !== false,
});

initDownloads({
  getMainWindow: () => mainWindow,
});

initServiceViews({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
  openLinkPreview,
});

registerServicesIpc({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
});

registerSettingsIpc({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
});

registerListGroupsIpc();

registerUpdater({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
});

// Pomodoro (internal "pomodoro" service): daily tasks, optionally synced to
// Notion, plus the focus timer that runs alongside them.
registerPomodoro({
  store,
  getUiView: () => uiView,
  onTaskRemoved: (serviceId, taskId) => stopTimerForTask(serviceId, taskId),
});

registerPomodoroTimer({
  getUiView: () => uiView,
  onFocusSessionComplete: (serviceId, taskId) => recordFocusSession(store, serviceId, taskId),
});

// Messenger automation (scheduled/interval sends, call cycles)
registerMessengerAutomation({
  getServiceView: (serviceId) => getServiceView(serviceId),
  getServices: () => store.get("services"),
  getUiView: () => uiView,
  monitorCallForAnswer: (serviceId, timeoutMs) => monitorCallForAnswer(serviceId, timeoutMs),
  closeCallWindow: (serviceId) => closeCallWindow(serviceId),
  armAutomationCall: (serviceId) => armAutomationCall(serviceId),
  loadPersistedTasks: () => store.get("automationTasks"),
  savePersistedTasks: (tasks) => store.set("automationTasks", tasks),
  loadPersistedAutoStops: () => store.get("automationAutoStops"),
  savePersistedAutoStops: (autoStops) => store.set("automationAutoStops", autoStops),
  getServiceIds: () => store.get("services").map((s) => s.id),
  getRecentEmojis: () => sanitizeRecentEmojis(store.get("recentEmojis")),
  recordRecentEmoji: (emoji) => {
    const updated = addRecentEmoji(store.get("recentEmojis"), emoji);
    store.set("recentEmojis", updated);
    return updated;
  },
});

// --- UI-layer IPC (z-order, link preview, window controls) -------------------

// Z-order control: WebContentsView child reordering doesn't reliably
// control z-order on Windows, so we hide the active service view instead.
// Ref-counted so nested overlays (context menu → modal) work correctly.
ipcMain.on("bring-ui-to-front", () => {
  uiLayerRefCount++;
  // Always hide the active service view when any overlay is open
  setActiveViewVisible(false);
});

ipcMain.on("send-ui-to-back", () => {
  uiLayerRefCount = Math.max(0, uiLayerRefCount - 1);
  // Only show the service view when ALL overlays are closed
  if (uiLayerRefCount === 0) {
    setActiveViewVisible(true);
  }
});

ipcMain.on("close-link-preview", () => {
  closeLinkPreview();
});

ipcMain.on("open-link-external", (_event, url: string) => {
  if (typeof url === "string" && /^https?:/i.test(url)) {
    shell.openExternal(url);
  }
});

// Split the layout into service (left) + automation panel (right) by resizing
// the active service view, so the service stays visible beside the panel.
ipcMain.on("set-automation-split", (_event, open: unknown) => {
  setAutomationSplitOpen(open === true);
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

// --- App lifecycle -------------------------------------------------------------

app.whenReady().then(() => {
  // Serves uploaded service icons to the UI view.
  //
  // Registered on the *default* session rather than app-wide (issue #67).
  // Service views and the link preview each run in their own partition, so
  // the scheme simply doesn't exist for them — a hostile page inside a
  // service view can't reach this handler at all. The UI view is the only
  // thing on the default session, and the only caller that needs it.
  session.defaultSession.protocol.handle("custom-icon", (request) => {
    const requested = decodeURIComponent(request.url.replace(/^custom-icon:\/\//, ""));
    // Same containment check the IPC side uses — a name that resolves outside
    // custom-icons/ is refused rather than read off disk.
    const filePath = resolveCustomIconPath(requested, customIconsDir());
    if (!filePath) return new Response(null, { status: 404 });
    // pathToFileURL, not string concatenation: it escapes spaces, "#", and
    // Windows separators that would otherwise corrupt the URL.
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // Reclaim session partitions left behind by services removed before removal
  // wiped them. Runs before any service view opens a session, so nothing being
  // deleted is in use.
  sweepOrphanedPartitions(store.get("services").map((s) => s.id));

  // Reclaim uploaded icons no service points at any more, including ones left
  // behind by versions that never cleaned up on replace or remove (issue #70).
  sweepOrphanedIcons(store.get("services"));

  createWindow();
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
