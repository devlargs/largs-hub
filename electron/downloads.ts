import { BrowserWindow, WebContentsView, shell } from "electron";
import { store } from "./store";
import { uniqueSavePath } from "./uniqueFilename";
import {
  EMPTY_BATCH,
  ToastBatch,
  batchSettled,
  beginDownload,
  finishDownload,
  toastLabel,
} from "./downloadToastBatch";

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
// Downloads still in flight, counted per partition. Hibernation checks this
// before tearing a view down (issue #76).
const activeDownloads = new Map<string, number>();

/** Whether a service partition has a download in progress. */
export function hasActiveDownload(partition: string): boolean {
  return (activeDownloads.get(partition) ?? 0) > 0;
}

// Apply download folder setting — attach once per persistent session, since
// the session (and this listener) outlives any single view recreation.
export function hookDownloadSession(view: WebContentsView, partition: string) {
  if (hookedDownloadSessions.has(partition)) return;
  hookedDownloadSessions.add(partition);
  view.webContents.session.on("will-download", (_event, item) => {
    activeDownloads.set(partition, (activeDownloads.get(partition) ?? 0) + 1);
    // The toast batch spans every partition — two services downloading at once
    // are still one toast to the user (issue #99).
    toastBatch = beginDownload(toastBatch, toastWindow !== null);
    item.once("done", () => {
      const remaining = (activeDownloads.get(partition) ?? 1) - 1;
      if (remaining > 0) activeDownloads.set(partition, remaining);
      else activeDownloads.delete(partition);
    });
    const downloadFolder = store.get("downloadFolder");
    if (downloadFolder) {
      // Never write over a file that's already there — Chromium only handles
      // collisions when it shows its own dialog, which it doesn't do once a
      // save path is set (issue #72).
      item.setSavePath(uniqueSavePath(downloadFolder, item.getFilename()));
    }
    item.on("done", (_e, state) => {
      toastBatch = finishDownload(toastBatch, state === "completed");
      if (state !== "completed") {
        // The total just changed, so a toast already on screen is now stale.
        refreshDownloadToast();
        return;
      }
      const savePath = item.getSavePath();
      if (store.get("openFolderOnFinish")) shell.showItemInFolder(savePath);
      if (store.get("openFileOnFinish")) shell.openPath(savePath);
      if (store.get("downloadAlertOnFinish") && deps?.getMainWindow()) {
        showDownloadToast(item.getFilename());
      }
    });
  });
}

// The completion toast stays up until the user dismisses it, so it's tracked
// here: to follow the main window as it moves, and to be torn down when the app
// closes (a stray toast window would otherwise keep the app alive past
// "window-all-closed").
//
// There is only ever one. Downloading a handful of files used to stack a
// separate window per file up the side of the screen; now the single toast is
// re-labelled in place and counts them off — "Downloaded 1/2" (issue #99).
const TOAST_WIDTH = 340;
const TOAST_HEIGHT = 56;
const TOAST_MARGIN = 16;

let toastWindow: BrowserWindow | null = null;
// Hidden while the main window is minimized, so a download that finishes in the
// meantime updates the toast without popping it over whatever is on screen.
let toastsHidden = false;
let toastBatch: ToastBatch = EMPTY_BATCH;

// Sentinel the close button "navigates" to; never actually loaded.
const CLOSE_URL = "https://largs.invalid/close-toast";

// Bottom-right of the main window.
export function repositionDownloadToasts() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!toastWindow || toastWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  toastWindow.setPosition(
    bounds.x + bounds.width - TOAST_WIDTH - TOAST_MARGIN,
    bounds.y + bounds.height - TOAST_MARGIN - TOAST_HEIGHT,
  );
}

// The toast floats above every app, so it follows the main window out of sight
// when it's minimized instead of hanging over whatever the user switched to.
export function setDownloadToastsVisible(visible: boolean) {
  toastsHidden = !visible;
  if (!toastWindow || toastWindow.isDestroyed()) return;
  if (visible) toastWindow.showInactive();
  else toastWindow.hide();
}

export function closeAllDownloadToasts() {
  if (toastWindow && !toastWindow.isDestroyed()) toastWindow.close();
  toastWindow = null;
}

// Escape HTML metacharacters — a filename is arbitrary text going into markup.
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toastHtml(label: string, fileName: string) {
  return `<html><body style="margin:0;font-family:Segoe UI,sans-serif;background:transparent;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(30,30,46,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#cdd6f4;font-size:13px;backdrop-filter:blur(12px);">
        <span id="label" style="color:#89b4fa;font-weight:600;white-space:nowrap;">${escapeHtml(label)}</span>
        <span id="file" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a6adc8;">${escapeHtml(fileName)}</span>
        <a href="${CLOSE_URL}" title="Close" style="flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:-4px;border-radius:6px;color:#a6adc8;text-decoration:none;font-size:15px;line-height:1;-webkit-user-select:none;">&#10005;</a>
      </div>
      <style>a:hover{background:rgba(255,255,255,0.12);color:#cdd6f4;}</style>
    </body></html>`;
}

// Re-label the toast already on screen. Text is set through textContent rather
// than by reloading the page: a reload would blink, and the filename never
// becomes markup this way.
function refreshDownloadToast(fileName?: string) {
  if (!toastWindow || toastWindow.isDestroyed()) return;
  const label = JSON.stringify(toastLabel(toastBatch));
  const file = fileName === undefined ? null : JSON.stringify(fileName);
  void toastWindow.webContents
    .executeJavaScript(
      `(() => {
        const label = document.getElementById("label");
        if (label) label.textContent = ${label};
        const file = ${file === null ? "null" : file};
        const fileEl = document.getElementById("file");
        if (file !== null && fileEl) fileEl.textContent = file;
      })();`,
    )
    .catch(() => {
      // The page can be mid-load; the next completion re-labels it anyway.
    });
}

function showDownloadToast(fileName: string) {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return;

  // Already on screen — re-label it instead of opening a second window.
  if (toastWindow && !toastWindow.isDestroyed()) {
    refreshDownloadToast(fileName);
    if (!toastsHidden) toastWindow.showInactive();
    return;
  }

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
  toastWindow = toast;
  toast.on("closed", () => {
    if (toastWindow === toast) toastWindow = null;
    // Dismissing the toast ends the batch, so the next download starts counting
    // from one again — unless something is still coming in.
    if (batchSettled(toastBatch)) toastBatch = EMPTY_BATCH;
  });
  // The toast page has no preload, so the close button signals the main process
  // by attempting a navigation we intercept and cancel here.
  toast.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (url.startsWith(CLOSE_URL) && !toast.isDestroyed()) toast.close();
  });
  // URL-encode the whole document: a raw "#" or "%" in a filename would
  // otherwise truncate or corrupt the data: URL.
  const html = toastHtml(toastLabel(toastBatch), fileName);
  toast.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  toast.once("ready-to-show", () => {
    repositionDownloadToasts();
    if (!toastsHidden) toast.showInactive();
  });
}
