import { BrowserWindow, WebContentsView } from "electron";
import path from "path";
import { store, StoreSchema } from "../store";
import { restoreAutomationState } from "../messengerAutomation";
import { initTray, isQuitting, isTrayAvailable, refreshTray, syncTray } from "../tray";
import { windowCloseAction, windowMinimizeAction } from "../trayMenu";
import { MAC_TRAFFIC_LIGHT_POSITION } from "../shared/layout";
import { APP_ENTRY_URL, guardUiView } from "../uiViewGuard";
import { DEVTOOLS_ENABLED } from "../devMode";
import { attachSecurityWindowEvents } from "../ipc/security";
import { createDebouncedSaver } from "../debouncedSave";
import {
  repositionDownloadToasts,
  closeAllDownloadToasts,
  setDownloadToastsVisible,
} from "../downloads";
import {
  refreshTaskbarBadge,
  getNotificationCounts,
  setBadgeChangeListener,
} from "../notificationCounts";
import {
  repositionActiveView,
  showService,
  setWindowMinimized,
  watchPowerForPolling,
  pushAutomationWidth,
  handleWindowFocus,
  handleWindowBlur,
  startHibernationSweep,
  stopHibernationSweep,
  preloadServices,
  clearAllViewState,
} from "../serviceViews";
import { shortcutHints, windowState } from "./state";
import { repositionLinkPreview } from "./linkPreview";

// Window bounds change on every resize/move tick; electron-store writes the
// whole config file synchronously, so coalesce those writes behind a debounce.
const bounds = createDebouncedSaver<StoreSchema["windowBounds"]>({
  read: () => store.get("windowBounds"),
  write: (value) => store.set("windowBounds", value),
  delayMs: 500,
});

export function createWindow() {
  const saved = store.get("windowBounds");

  const mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 480,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    // macOS keeps its native close/minimize/zoom buttons; line them up with the
    // custom titlebar. Windows draws its own buttons in React.
    ...(process.platform === "darwin" ? { trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION } : {}),
    backgroundColor: "#181825",
    ...(process.env.NODE_ENV !== "development" && !process.argv.includes("--dev")
      ? { icon: path.join(__dirname, "../../assets/ico/icon.ico") }
      : {}),
  });
  windowState.mainWindow = mainWindow;

  // Restore the last window state rather than always maximizing — an
  // auto-update relaunches the app, and coming back maximized when you weren't
  // is the visible symptom (issue #92).
  if (store.get("windowMaximized")) {
    mainWindow.maximize();
  }

  mainWindow.on("maximize", () => store.set("windowMaximized", true));
  mainWindow.on("unmaximize", () => store.set("windowMaximized", false));

  const uiView = createUiView(mainWindow);
  const resizeUiView = () => {
    const [width, height] = mainWindow.getContentSize();
    uiView.setBounds({ x: 0, y: 0, width, height });
  };
  resizeUiView();
  uiView.webContents.loadURL(APP_ENTRY_URL);

  mainWindow.on("resize", () => {
    // While maximized the size is the screen's, not the user's — saving it
    // would leave nothing to restore to on unmaximize.
    if (!mainWindow.isMaximized()) {
      const [width, height] = mainWindow.getSize();
      bounds.save({ width, height });
    }
    resizeUiView();
    repositionActiveView();
    pushAutomationWidth(); // the panel follows the window, not a fixed ratio
    repositionLinkPreview();
    repositionDownloadToasts(); // toasts sit against the window's corner
  });

  mainWindow.on("move", () => {
    if (!mainWindow.isMaximized()) {
      const [x, y] = mainWindow.getPosition();
      bounds.save({ x, y });
    }
    repositionDownloadToasts();
  });

  mainWindow.on("focus", () => {
    mainWindow.flashFrame(false); // Stop taskbar flashing
    handleWindowFocus();
  });

  mainWindow.on("blur", () => {
    handleWindowBlur();
    shortcutHints.reset();
  });

  mainWindow.on("minimize", () => setDownloadToastsVisible(false));
  mainWindow.on("restore", () => {
    repositionDownloadToasts();
    setDownloadToastsVisible(true);
  });

  attachTrayBehaviour(mainWindow);

  mainWindow.on("closed", () => {
    bounds.flush(); // persist any bounds still buffered by the debounce
    // Toasts are top-level windows; leaving one open would block "window-all-closed"
    closeAllDownloadToasts();
    stopHibernationSweep();
    windowState.mainWindow = null;
    windowState.uiView = null;
    windowState.linkPreviewView = null;
    clearAllViewState();
  });

  // Poll rate follows window state and power (issue #80).
  mainWindow.on("minimize", () => setWindowMinimized(true));
  mainWindow.on("restore", () => setWindowMinimized(false));
  mainWindow.on("show", () => setWindowMinimized(false));
  watchPowerForPolling();

  // Auto-lock countdown follows the window, not the renderer (issue #102).
  attachSecurityWindowEvents(mainWindow);

  startHibernationSweep();

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

// The React app, as a WebContentsView for z-order control
function createUiView(mainWindow: BrowserWindow): WebContentsView {
  const uiView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload only needs contextBridge and ipcRenderer, both available
      // to a sandboxed preload (issue #112).
      sandbox: true,
      // DevTools here would reach window.electronAPI past the lock (#111).
      devTools: DEVTOOLS_ENABLED,
    },
  });

  uiView.setBackgroundColor("#00000000");
  guardUiView(uiView.webContents);
  uiView.webContents.on("before-input-event", (_event, input) => {
    shortcutHints.handleInput(input);
  });
  mainWindow.contentView.addChildView(uiView);
  windowState.uiView = uiView;
  return uiView;
}

// Close/minimize to tray (issue #90), and the tray itself. Both settings are
// off by default, so without them the window behaves exactly as before.
function attachTrayBehaviour(mainWindow: BrowserWindow) {
  mainWindow.on("close", (event) => {
    if (isQuitting()) return;
    if (windowCloseAction(store.get("closeToTray"), isTrayAvailable()) === "hide") {
      event.preventDefault();
      mainWindow.hide();
      refreshTray(); // the menu's Show/Hide label just changed
    }
  });

  mainWindow.on("minimize", () => {
    if (windowMinimizeAction(store.get("minimizeToTray"), isTrayAvailable()) === "hide") {
      mainWindow.hide();
      refreshTray();
    }
  });

  initTray({
    getMainWindow: () => windowState.mainWindow,
    showService: (serviceId) => {
      showService(serviceId);
      windowState.uiView?.webContents.send("service-switched", serviceId);
    },
    getNotificationCounts,
  });
  syncTray();
  setBadgeChangeListener(refreshTray);
}
