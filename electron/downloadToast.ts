import { BrowserWindow, shell } from "electron";
import {
  EMPTY_BATCH,
  ToastBatch,
  batchSettled,
  beginDownload,
  finishDownload,
  toastLabel,
} from "./downloadToastBatch";
import { CLOSE_URL, OPEN_LOCATION_URL, toastHtml } from "./downloadToastHtml";

// The download-complete toast. It stays up until the user dismisses it, so it's
// tracked here: to follow the main window as it moves, and to be torn down when
// the app closes (a stray toast window would otherwise keep the app alive past
// "window-all-closed").
//
// There is only ever one. Downloading a handful of files used to stack a
// separate window per file up the side of the screen; now the single toast is
// re-labelled in place and counts them off — "Downloaded 1/2" (issue #99).

const TOAST_WIDTH = 420;
const TOAST_HEIGHT = 56;
const TOAST_MARGIN = 16;

let getMainWindow: () => BrowserWindow | null = () => null;
let toastWindow: BrowserWindow | null = null;
// Hidden while the main window is minimized, so a download that finishes in the
// meantime updates the toast without popping it over whatever is on screen.
let toastsHidden = false;
let toastBatch: ToastBatch = EMPTY_BATCH;
// The file the toast names, for its "Open file location" link. Kept in main:
// the toast page only says the link was clicked, never which path to open.
let shownSavePath: string | null = null;

export function initDownloadToast(mainWindow: () => BrowserWindow | null) {
  getMainWindow = mainWindow;
}

/** A download began: it joins the current batch, or starts a new one. */
export function noteDownloadStarted() {
  // The batch spans every partition — two services downloading at once are
  // still one toast to the user (issue #99).
  toastBatch = beginDownload(toastBatch, toastWindow !== null);
}

/** A download was cancelled or failed: it's taken back out of the count. */
export function noteDownloadFailed() {
  toastBatch = finishDownload(toastBatch, false);
  // The total just changed, so a toast already on screen is now stale.
  refreshDownloadToast();
}

/** A download finished; `showToast` is the user's "Download alert" setting. */
export function noteDownloadCompleted(fileName: string, savePath: string, showToast: boolean) {
  toastBatch = finishDownload(toastBatch, true);
  if (showToast) showDownloadToast(fileName, savePath);
}

// Bottom-right of the main window.
export function repositionDownloadToasts() {
  const mainWindow = getMainWindow();
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

function showDownloadToast(fileName: string, savePath: string) {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;
  shownSavePath = savePath;

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
    // Focusable so the links reliably receive clicks; the window is only ever
    // shown with showInactive(), so it never steals focus on its own.
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
  // The links signal main by attempting a navigation, cancelled here.
  toast.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (toast.isDestroyed()) return;
    if (url.startsWith(OPEN_LOCATION_URL)) {
      // Selects the file in File Explorer (Windows) or Finder (macOS). If it
      // was moved or deleted since, the OS opens the folder or does nothing.
      if (shownSavePath) shell.showItemInFolder(shownSavePath);
      toast.close();
    } else if (url.startsWith(CLOSE_URL)) {
      toast.close();
    }
  });
  // URL-encode the whole document: a raw "#" or "%" in a filename would
  // otherwise truncate or corrupt the data: URL.
  const html = toastHtml(toastLabel(toastBatch), fileName, process.platform);
  toast.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  toast.once("ready-to-show", () => {
    repositionDownloadToasts();
    if (!toastsHidden) toast.showInactive();
  });
}
