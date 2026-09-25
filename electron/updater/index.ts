import { app, ipcMain, WebContentsView } from "electron";
import fs from "fs";
import { PendingUpdate, releasePageUrl, resolveUpdate } from "./release";
import { downloadVerified } from "./download";
import { createUpdateDir, installUpdate, installerPathIn, removeStaleUpdates } from "./install";

// In-app updater: checks the latest GitHub release for devlargs/largs-hub and
// downloads + launches the NSIS installer on Windows. On macOS it downloads the
// DMG and hands it to a script that swaps the new app in and relaunches it
// (see macUpdate.ts), falling back to opening the DMG in Finder when the app
// can't replace itself. Pending update info is kept in the main process; the
// renderer only gets a boolean + version string and can never influence what
// gets downloaded.
//
//   version.ts   version parsing and comparison (pure)
//   release.ts   picking the asset and checksum from a release (pure)
//   download.ts  the allowlisted, checksum-verified download
//   verify.ts    redirect, size and checksum rules for that download (pure)
//   paths.ts     where a download goes, and what cleanup removes (pure)
//   install.ts   running the installer / swap script, installer cleanup

export { parseVersion, isNewerVersion } from "./version";
export { pickUpdateAsset, resolveUpdate, parseSha256Digest, releasePageUrl } from "./release";
export type { ReleaseAsset, PendingUpdate } from "./release";
export {
  UPDATE_DIR_PREFIX,
  LEGACY_INSTALLER_NAMES,
  installerFileName,
  staleUpdateEntries,
} from "./paths";
export { removeStaleUpdates } from "./install";
export type { UpdateCleanupFs } from "./install";

interface UpdaterDeps {
  getUiView(): WebContentsView | null;
  getMainWindow(): unknown | null;
}

let pendingUpdate: PendingUpdate | null = null;
// The directory of the download in progress, which cleanup must leave alone
let currentUpdateDir: string | null = null;

// Long enough that the installer which relaunched us has exited.
const STALE_INSTALLER_DELAY_MS = 15_000;

const LATEST_RELEASE_URL = "https://api.github.com/repos/devlargs/largs-hub/releases/latest";

export function registerUpdater(deps: UpdaterDeps) {
  // Clear earlier updates' installers out of the temp folder. Deferred rather than done at
  // startup so it doesn't race the installer that just relaunched the app, and
  // unref'd so a pending timer can never hold the process open.
  const cleanupTimer = setTimeout(() => {
    void removeStaleUpdates(app.getPath("temp"), currentUpdateDir);
  }, STALE_INSTALLER_DELAY_MS);
  cleanupTimer.unref?.();

  ipcMain.handle("check-for-updates", async () => {
    pendingUpdate = null;
    try {
      const response = await fetch(LATEST_RELEASE_URL);
      if (!response.ok) return { updateAvailable: false };
      const update = resolveUpdate(
        await response.json(),
        app.getVersion(),
        process.platform,
        process.arch,
      );
      if (!update) return { updateAvailable: false };
      pendingUpdate = update;
      // No checksum means nothing to verify the download against, and the
      // builds aren't signed either, so it's offered for manual download only
      // (issue #122).
      return {
        updateAvailable: true,
        version: update.version,
        canInstall: update.sha256 !== null,
        releaseUrl: releasePageUrl(update.version),
      };
    } catch {
      return { updateAvailable: false };
    }
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("download-and-install-update", async () => {
    // The URL comes from the main-process check-for-updates result, never from
    // the renderer.
    if (!pendingUpdate) throw new Error("No update available. Run a check first.");
    const { url, sha256 } = pendingUpdate;
    if (!sha256) throw new Error("Update has no checksum to verify; download it manually.");
    const dir = await createUpdateDir();
    currentUpdateDir = dir;
    try {
      const filePath = installerPathIn(dir);
      await downloadVerified(url, sha256, filePath, (percent) => {
        if (deps.getMainWindow()) {
          deps.getUiView()?.webContents.send("update-download-progress", { percent });
        }
      });
      await installUpdate(filePath, sha256);
    } catch (err) {
      // Nothing to keep from a failed attempt; a retry gets a fresh directory
      currentUpdateDir = null;
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });
}
