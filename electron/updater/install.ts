import { app, shell } from "electron";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn } from "child_process";
import { MAC_UPDATE_SCRIPT, MAC_UPDATE_SCRIPT_NAME, macAppBundlePath } from "../macUpdate";
import { hashFile } from "./download";
import { UPDATE_DIR_PREFIX, installerFileName, staleUpdateEntries } from "./paths";
import { sameSha256 } from "./verify";

// Running a downloaded update: the NSIS installer on Windows; on macOS a
// script that swaps the new app in and relaunches it (see macUpdate.ts), or,
// when this copy can't replace itself, the DMG opened in Finder. Also where
// the installer file lives, and cleaning it up afterwards.

// Each download goes to a random file in its own mkdtemp directory (see
// paths.ts, issue #127). It can't be deleted on the success path — the app
// force-exits seconds after spawning the detached NSIS process, which is still
// reading the file — so it's cleaned up on the next launch instead (issue #65).

/** Makes a fresh directory for one update download and returns its path. */
export function createUpdateDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(app.getPath("temp"), UPDATE_DIR_PREFIX));
}

/** A random installer path inside `dir`, from createUpdateDir. */
export function installerPathIn(dir: string, platform: NodeJS.Platform = process.platform): string {
  return path.join(dir, installerFileName(platform, crypto.randomBytes(16).toString("hex")));
}

export interface UpdateCleanupFs {
  readdir(dir: string): Promise<string[]>;
  rm(target: string, options: { recursive: true; force: true }): Promise<void>;
}

/**
 * Deletes what earlier updates left in the temp folder (`tempDir`), except
 * `currentDir`, the directory of a download in progress. Resolves with the
 * number removed. Something still locked is skipped — after `--force-run`
 * relaunches us, NSIS may not have exited yet, and on Windows removing a file
 * it still holds fails with EBUSY/EPERM — and the next launch tries again, so
 * failures are not worth surfacing.
 */
export async function removeStaleUpdates(
  tempDir: string,
  currentDir: string | null,
  fsLike: UpdateCleanupFs = fs.promises,
): Promise<number> {
  let entries: string[];
  try {
    entries = await fsLike.readdir(tempDir);
  } catch {
    return 0;
  }
  const keep = currentDir ? path.basename(currentDir) : null;
  let removed = 0;
  for (const name of staleUpdateEntries(entries, keep)) {
    try {
      await fsLike.rm(path.join(tempDir, name), { recursive: true, force: true });
      removed++;
    } catch {
      // Still locked; next launch
    }
  }
  return removed;
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
// The script goes in the DMG's own update directory, so its path can't be
// guessed either. Its output goes to a log in the temp folder, the only trace
// of an update that went wrong after the app had already quit; it stays there
// (the update directory is cleaned up on the next launch) until the next update.
function spawnMacUpdate(dmgPath: string, bundle: string): void {
  const scriptPath = path.join(path.dirname(dmgPath), MAC_UPDATE_SCRIPT_NAME);
  fs.writeFileSync(scriptPath, MAC_UPDATE_SCRIPT, { mode: 0o700 });
  const log = fs.openSync(path.join(app.getPath("temp"), "largs-hub-update.log"), "w");
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
// app quits; rejects if the update couldn't be started. The file is hashed
// again right before it runs, so one changed on disk since the download was
// checked is refused (issue #127).
export async function installUpdate(filePath: string, expectedSha256: string): Promise<void> {
  if (!sameSha256(await hashFile(filePath), expectedSha256)) {
    await fs.promises.rm(filePath, { force: true });
    throw new Error("Update rejected: the installer changed after it was checked");
  }
  return process.platform === "darwin" ? installOnMac(filePath) : installOnWindows(filePath);
}
