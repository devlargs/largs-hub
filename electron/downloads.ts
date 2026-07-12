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

function showDownloadToast(fileName: string) {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const toastWidth = 340;
  const toastHeight = 56;
  const margin = 16;
  const toast = new BrowserWindow({
    width: toastWidth,
    height: toastHeight,
    x: bounds.x + bounds.width - toastWidth - margin,
    y: bounds.y + bounds.height - toastHeight - margin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
  });
  // Escape HTML metacharacters, then URL-encode the whole document: a raw
  // "#" or "%" in a filename would otherwise truncate/corrupt the data: URL.
  const escaped = fileName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = `<html><body style="margin:0;font-family:Segoe UI,sans-serif;background:transparent;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(30,30,46,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#cdd6f4;font-size:13px;backdrop-filter:blur(12px);">
        <span style="color:#89b4fa;font-weight:600;white-space:nowrap;">Download complete</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a6adc8;">${escaped}</span>
      </div>
    </body></html>`;
  toast.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  toast.once("ready-to-show", () => {
    toast.showInactive();
    setTimeout(() => { if (!toast.isDestroyed()) toast.close(); }, 4000);
  });
}
