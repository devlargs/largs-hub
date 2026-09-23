import { app, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { MAC_UPDATE_SCRIPT, MAC_UPDATE_SCRIPT_NAME, macAppBundlePath } from "../macUpdate";

// Running a downloaded update: the NSIS installer on Windows; on macOS a
// script that swaps the new app in and relaunches it (see macUpdate.ts), or,
// when this copy can't replace itself, the DMG opened in Finder. Also where
// the installer file lives, and cleaning it up afterwards.

// The downloaded installer goes to a fixed filename, so successive updates
// overwrite it instead of piling up. It still can't be deleted on the success
// path — the app force-exits seconds after spawning the detached NSIS process,
// which is still reading the file — so it's cleaned up on the next launch
// instead (issue #65).
export const UPDATE_INSTALLER_NAME = "largs-hub-update.exe";
export const MAC_UPDATE_INSTALLER_NAME = "largs-hub-update.dmg";

export function updateInstallerPath(platform: NodeJS.Platform = process.platform): string {
  return path.join(
    app.getPath("temp"),
    platform === "darwin" ? MAC_UPDATE_INSTALLER_NAME : UPDATE_INSTALLER_NAME,
  );
}

export interface InstallerCleanupFs {
  unlink(filePath: string, callback: (err: NodeJS.ErrnoException | null) => void): void;
}

/**
 * Deletes the installer a previous update left in %TEMP%. Resolves false when
 * there was nothing to remove, or when the file is still locked — after
 * `--force-run` relaunches us, NSIS may not have exited yet, and on Windows
 * unlinking a file it still holds fails with EBUSY/EPERM. Either way the next
 * launch tries again, so failures are not worth surfacing.
 */
export function removeStaleInstaller(
  filePath: string,
  fsLike: InstallerCleanupFs = fs,
): Promise<boolean> {
  return new Promise((resolve) => {
    fsLike.unlink(filePath, (err) => resolve(!err));
  });
}

// Quit so the installer (or the swap script) can replace this copy. Force-exit
// after a moment so nothing (a stray window handler, a pending IPC) can keep
// the old instance alive and block it.
function quitForUpdate() {
  app.quit();
  setTimeout(() => app.exit(0), 2000);
}

// The bundle to replace on macOS, or null when this copy can't replace itself:
// macAppBundlePath rules out dev runs, the DMG and translocated copies, and the
// bundle and the folder it sits in have to be writable for the swap.
function macReplaceableBundle(): string | null {
  const bundle = macAppBundlePath(app.getPath("exe"));
  if (!bundle) return null;
  try {
    fs.accessSync(bundle, fs.constants.W_OK);
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    return bundle;
  } catch {
    return null;
  }
}

// Starts the macOS update script, fully detached so it outlives this process.
// Its output goes to a log next to it in the temp folder, the only trace of an
// update that went wrong after the app had already quit.
function spawnMacUpdate(dmgPath: string, bundle: string): void {
  const dir = app.getPath("temp");
  const scriptPath = path.join(dir, MAC_UPDATE_SCRIPT_NAME);
  fs.writeFileSync(scriptPath, MAC_UPDATE_SCRIPT, { mode: 0o755 });
  const log = fs.openSync(path.join(dir, "largs-hub-update.log"), "w");
  try {
    const child = spawn("/bin/bash", [scriptPath, String(process.pid), dmgPath, bundle], {
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();
  } finally {
    fs.closeSync(log);
  }
}

function installOnMac(dmgPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Replace the app in place and relaunch it, like Windows.
    const bundle = macReplaceableBundle();
    if (bundle) {
      try {
        spawnMacUpdate(dmgPath, bundle);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      setTimeout(() => {
        resolve();
        quitForUpdate();
      }, 1000);
      return;
    }
    // Can't replace this copy (running from the DMG, translocated, or
    // Applications isn't writable): mount the DMG in Finder so the user can
    // drag the new app over the old one, then quit so the old copy isn't in use.
    void shell.openPath(dmgPath).then((err) => {
      if (err) {
        reject(new Error(`Could not open the update: ${err}`));
        return;
      }
      resolve();
      quitForUpdate();
    });
  });
}

function installOnWindows(installerPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Launch the NSIS installer silently in a fully detached process. Args
    // match what electron-updater uses: `--updated` marks this as an update
    // rather than a fresh install, and `--force-run` is what makes a *silent*
    // installer relaunch the app when it finishes — without it the installer
    // exits quietly and the app never reopens.
    const child = spawn(installerPath, ["--updated", "/S", "--force-run"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.unref();
    // Give the spawned process a moment to start before quitting.
    setTimeout(() => {
      resolve();
      quitForUpdate();
    }, 1000);
  });
}

// Run the verified download at `filePath` and quit. Resolves just before the
// app quits; rejects if the update couldn't be started.
export function installUpdate(filePath: string): Promise<void> {
  return process.platform === "darwin" ? installOnMac(filePath) : installOnWindows(filePath);
}
