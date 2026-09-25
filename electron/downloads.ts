import { BrowserWindow, WebContentsView, shell } from "electron";
import path from "path";
import { isSafeToAutoOpen } from "./autoOpenPolicy";
import { store } from "./store";
import { uniqueSavePath } from "./uniqueFilename";
import {
  initDownloadToast,
  noteDownloadCompleted,
  noteDownloadFailed,
  noteDownloadStarted,
} from "./downloadToast";

export {
  closeAllDownloadToasts,
  repositionDownloadToasts,
  setDownloadToastsVisible,
} from "./downloadToast";

// Download handling for service views: per-session "will-download" hook that
// applies the user's download settings. The toast shown on completion lives in
// downloadToast.ts.

interface DownloadDeps {
  getMainWindow(): BrowserWindow | null;
}

export function initDownloads(d: DownloadDeps) {
  initDownloadToast(d.getMainWindow);
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
    noteDownloadStarted();
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
      if (state !== "completed") {
        noteDownloadFailed();
        return;
      }
      const savePath = item.getSavePath();
      const openFolder = store.get("openFolderOnFinish");
      if (openFolder) shell.showItemInFolder(savePath);
      if (store.get("openFileOnFinish")) {
        // Only a file the user clicked to download, of a type that can't run
        // code, is opened. Anything else is shown in its folder instead, so the
        // user decides whether to open it (issue #120).
        const safe =
          item.hasUserGesture() && isSafeToAutoOpen(path.basename(savePath), process.platform);
        if (safe) void shell.openPath(savePath);
        else if (!openFolder) shell.showItemInFolder(savePath);
      }
      noteDownloadCompleted(item.getFilename(), savePath, store.get("downloadAlertOnFinish"));
    });
  });
}
