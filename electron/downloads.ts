import { BrowserWindow, WebContentsView, shell } from "electron";
import path from "path";
import { store } from "./store";

// Download handling for service views: per-session "will-download" hook that
// applies the user's download settings, plus the toast shown on completion.

interface DownloadDeps {
  getMainWindow(): BrowserWindow | null;
}

let deps: DownloadDeps | null = null;

export function initDownloads(d: DownloadDeps) {
  deps = d;
}

// Partitions whose persistent session already has the shared download listener.
// Sessions outlive individual views, so re-hooking when a view is recreated
// (URL change, disable→enable) would stack duplicate listeners that each fire
// the post-download side effects again.
const hookedDownloadSessions = new Set<string>();

// Apply download folder setting — attach once per persistent session, since
// the session (and this listener) outlives any single view recreation.
export function hookDownloadSession(view: WebContentsView, partition: string) {
  if (hookedDownloadSessions.has(partition)) return;
  hookedDownloadSessions.add(partition);
  view.webContents.session.on("will-download", (_event, item) => {
    const downloadFolder = store.get("downloadFolder");
    if (downloadFolder) {
      item.setSavePath(path.join(downloadFolder, item.getFilename()));
    }
    item.on("done", (_e, state) => {
      if (state !== "completed") return;
      const savePath = item.getSavePath();
      if (store.get("openFolderOnFinish")) shell.showItemInFolder(savePath);
      if (store.get("openFileOnFinish")) shell.openPath(savePath);
      if (store.get("downloadAlertOnFinish") && deps?.getMainWindow()) {
        showDownloadToast(item.getFilename());
      }
    });
  });
}

// Completion toasts stay up until the user dismisses them, so they're tracked
// here: to stack multiple downloads instead of overlapping, to follow the main
// window as it moves, and to be torn down when the app closes (a stray toast
// window would otherwise keep the app alive past "window-all-closed").
const TOAST_WIDTH = 340;
const TOAST_HEIGHT = 56;
const TOAST_MARGIN = 16;
const TOAST_GAP = 8;

const activeToasts: BrowserWindow[] = [];

// Sentinel the close button "navigates" to; never actually loaded.
const CLOSE_URL = "https://largs.invalid/close-toast";

// Bottom-right of the main window, newest toast closest to the corner.
export function repositionDownloadToasts() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  activeToasts.forEach((toast, index) => {
    if (toast.isDestroyed()) return;
    toast.setPosition(
      bounds.x + bounds.width - TOAST_WIDTH - TOAST_MARGIN,
      bounds.y + bounds.height - TOAST_MARGIN - (index + 1) * TOAST_HEIGHT - index * TOAST_GAP,
    );
  });
}

// Toasts float above every app, so they follow the main window out of sight
// when it's minimized instead of hanging over whatever the user switched to.
export function setDownloadToastsVisible(visible: boolean) {
  for (const toast of activeToasts) {
    if (toast.isDestroyed()) continue;
    if (visible) toast.showInactive();
    else toast.hide();
  }
}

export function closeAllDownloadToasts() {
  for (const toast of [...activeToasts]) {
    if (!toast.isDestroyed()) toast.close();
  }
  activeToasts.length = 0;
}

function showDownloadToast(fileName: string) {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return;
  const toast = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // Focusable so the close button reliably receives clicks; the window is
    // only ever shown with showInactive(), so it never steals focus on its own.
    focusable: true,
    show: false,
  });
  activeToasts.unshift(toast);
  toast.on("closed", () => {
    const index = activeToasts.indexOf(toast);
    if (index !== -1) activeToasts.splice(index, 1);
    repositionDownloadToasts();
  });
  // The toast page has no preload, so the close button signals the main process
  // by attempting a navigation we intercept and cancel here.
  toast.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (url.startsWith(CLOSE_URL) && !toast.isDestroyed()) toast.close();
  });
  // Escape HTML metacharacters, then URL-encode the whole document: a raw
  // "#" or "%" in a filename would otherwise truncate/corrupt the data: URL.
  const escaped = fileName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<html><body style="margin:0;font-family:Segoe UI,sans-serif;background:transparent;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(30,30,46,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#cdd6f4;font-size:13px;backdrop-filter:blur(12px);">
        <span style="color:#89b4fa;font-weight:600;white-space:nowrap;">Download complete</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a6adc8;">${escaped}</span>
        <a href="${CLOSE_URL}" title="Close" style="flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:-4px;border-radius:6px;color:#a6adc8;text-decoration:none;font-size:15px;line-height:1;-webkit-user-select:none;">&#10005;</a>
      </div>
      <style>a:hover{background:rgba(255,255,255,0.12);color:#cdd6f4;}</style>
    </body></html>`;
  toast.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  toast.once("ready-to-show", () => {
    repositionDownloadToasts();
    toast.showInactive();
  });
}
