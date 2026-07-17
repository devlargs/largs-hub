import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  protocol,
  net,
  shell,
} from "electron";
import path from "path";
import { store, StoreSchema } from "./store";
import { registerMessengerAutomation } from "./messengerAutomation";
import { registerNotionNotes } from "./notionNotes";
import { registerUpdater } from "./updater";
import { registerServicesIpc } from "./ipc/services";
import { registerSettingsIpc } from "./ipc/settings";
import { initDownloads } from "./downloads";
import { initNotificationCounts } from "./notificationCounts";
import {
  initServiceViews,
  getServiceView,
  setActiveViewVisible,
  setAutomationSplitOpen,
  repositionActiveView,
  handleWindowFocus,
  handleWindowBlur,
  startHibernationSweep,
  stopHibernationSweep,
  preloadServices,
  clearAllViewState,
  monitorCallForAnswer,
  closeCallWindow,
} from "./serviceViews";

// Entry point: owns the frameless window and the React UI layer (uiView), the
// link-preview overlay, and z-order IPC. Everything else lives in modules:
//   store.ts              persistent state + stored-shape validation
//   serviceViews.ts       service view lifecycle, switching, hibernation
//   downloads.ts          per-session download handling + completion toast
//   notificationCounts.ts badge state, debounce, taskbar overlay
//   badge-adapters/       per-service unread-count extraction
//   updater.ts            GitHub release check + installer download
//   ipc/services.ts       service CRUD/toggles/navigation/context menu
//   ipc/settings.ts       theme, settings, custom icons, settings menu

app.setName("Largs Hub");
app.setAppUserModelId("com.largs-hub.app");

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

  mainWindow.maximize();

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

  const resizeUiView = () => {
    if (!mainWindow || !uiView) return;
    const [width, height] = mainWindow.getContentSize();
    uiView.setBounds({ x: 0, y: 0, width, height });
  };
  resizeUiView();

  if (
    process.env.NODE_ENV === "development" ||
    process.argv.includes("--dev")
  ) {
    uiView.webContents.loadURL("http://localhost:5173");
  } else {
    uiView.webContents.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("resize", () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      saveBoundsDebounced({ width, height });
      resizeUiView();
      repositionActiveView();
      if (linkPreviewView) {
        linkPreviewView.setBounds(getLinkPreviewBounds());
      }
    }
  });

  mainWindow.on("focus", () => {
    mainWindow?.flashFrame(false); // Stop taskbar flashing
    handleWindowFocus();
  });

  mainWindow.on("blur", () => {
    handleWindowBlur();
  });

  mainWindow.on("move", () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      saveBoundsDebounced({ x, y });
    }
  });

  mainWindow.on("closed", () => {
    flushBounds(); // persist any bounds still buffered by the debounce
    stopHibernationSweep();
    mainWindow = null;
    uiView = null;
    linkPreviewView = null;
    clearAllViewState();
  });

  startHibernationSweep();

  // Pre-load all saved services so they're warm on startup (if enabled)
  uiView.webContents.on("did-finish-load", () => {
    preloadServices();
  });
}

// Link preview modal: the page renders in a WebContentsView layered on top,
// while the React UI draws the modal chrome (backdrop, header, close button)
// around it. Geometry must stay in sync with LinkPreviewModal.tsx.
const LINK_PREVIEW_MARGIN = 40;
const LINK_PREVIEW_HEADER = 52;

function getLinkPreviewBounds() {
  if (!mainWindow) return { x: 0, y: 0, width: 0, height: 0 };
  const [width, height] = mainWindow.getContentSize();
  const modalWidth = Math.min(1100, width - LINK_PREVIEW_MARGIN * 2);
  return {
    x: Math.round((width - modalWidth) / 2),
    y: LINK_PREVIEW_MARGIN + LINK_PREVIEW_HEADER,
    width: Math.max(0, modalWidth),
    height: Math.max(0, height - LINK_PREVIEW_MARGIN * 2 - LINK_PREVIEW_HEADER),
  };
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

registerUpdater({
  getMainWindow: () => mainWindow,
  getUiView: () => uiView,
});

// Notion-backed note taker (internal "notion-notes" service)
registerNotionNotes(store);

// Messenger automation (scheduled/interval sends, call cycles)
registerMessengerAutomation({
  getServiceView: (serviceId) => getServiceView(serviceId),
  getServices: () => store.get("services"),
  getUiView: () => uiView,
  monitorCallForAnswer: (serviceId, timeoutMs) => monitorCallForAnswer(serviceId, timeoutMs),
  closeCallWindow: (serviceId) => closeCallWindow(serviceId),
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
  // Register protocol to serve custom icon files
  protocol.handle("custom-icon", (request) => {
    const fileName = decodeURIComponent(request.url.replace("custom-icon://", ""));
    const filePath = path.join(app.getPath("userData"), "custom-icons", fileName);
    return net.fetch(`file://${filePath}`);
  });

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
