import { app, ipcMain, WebContentsView } from "electron";
import path from "path";
import fs from "fs";
import https from "https";
import crypto from "crypto";
import { spawn } from "child_process";

// In-app updater: checks the latest GitHub release for devlargs/largs-hub and
// downloads + launches the NSIS installer. Pending update info is kept in the
// main process; the renderer only gets a boolean + version string and can
// never influence what gets downloaded.

interface UpdaterDeps {
  getUiView(): WebContentsView | null;
  getMainWindow(): unknown | null;
}

let pendingUpdate: { url: string; sha256: string | null } | null = null;

// The downloaded installer goes to a fixed filename, so successive updates
// overwrite it instead of piling up. It still can't be deleted on the success
// path — the app force-exits seconds after spawning the detached NSIS process,
// which is still reading the file — so it's cleaned up on the next launch
// instead (issue #65).
export const UPDATE_INSTALLER_NAME = "largs-hub-update.exe";

export function updateInstallerPath(): string {
  return path.join(app.getPath("temp"), UPDATE_INSTALLER_NAME);
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

// Long enough that the installer which relaunched us has exited.
const STALE_INSTALLER_DELAY_MS = 15_000;

// --- Version comparison (issue #71) -----------------------------------------
// This used to be `latest !== current`, so any difference counted as newer: a
// deleted release, or a locally built version ahead of the published tag, made
// the app offer an "update" that silently downgraded the user — repeatedly,
// since the comparison stayed unequal afterwards.

/** Parses "1.2.3" or "v1.2.3" into [major, minor, patch]; null if it isn't one. */
export function parseVersion(raw: unknown): [number, number, number] | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True only when `latest` is strictly newer than `current`.
 *
 * Anything unparseable — a pre-release tag like "v0.1.42-rc1", a re-tag, an
 * empty string — returns false. Refusing to act on a tag we don't understand
 * is the safe direction: the install path force-quits the app and runs an
 * installer unattended.
 */
export function isNewerVersion(latest: unknown, current: unknown): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

const UPDATE_HOST_ALLOWLIST = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function isAllowedUpdateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && UPDATE_HOST_ALLOWLIST.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function registerUpdater(deps: UpdaterDeps) {
  // Clear last update's installer out of %TEMP%. Deferred rather than done at
  // startup so it doesn't race the installer that just relaunched the app, and
  // unref'd so a pending timer can never hold the process open.
  const cleanupTimer = setTimeout(() => {
    void removeStaleInstaller(updateInstallerPath());
  }, STALE_INSTALLER_DELAY_MS);
  cleanupTimer.unref?.();

  ipcMain.handle("check-for-updates", async () => {
    pendingUpdate = null;
    try {
      const response = await fetch(
        "https://api.github.com/repos/devlargs/largs-hub/releases/latest",
      );
      if (!response.ok) return { updateAvailable: false };
      const data = await response.json();
      const latest = (data.tag_name || "").replace(/^v/, "");
      const current = app.getVersion();
      if (isNewerVersion(latest, current)) {
        const asset = data.assets?.find(
          (a: { name: string }) => a.name.endsWith(".exe") && !a.name.endsWith(".blockmap"),
        );
        const downloadUrl: string | undefined = asset?.browser_download_url;
        if (!downloadUrl || !isAllowedUpdateUrl(downloadUrl)) {
          return { updateAvailable: false };
        }
        // GitHub publishes a sha256 digest per release asset
        const digest: string | undefined = asset?.digest;
        pendingUpdate = {
          url: downloadUrl,
          sha256: digest?.startsWith("sha256:") ? digest.slice("sha256:".length) : null,
        };
        return { updateAvailable: true, version: latest, downloadUrl };
      }
      return { updateAvailable: false };
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
    const { url: updateUrl, sha256: expectedSha256 } = pendingUpdate;

    const tmpPath = updateInstallerPath();

    return new Promise<void>((resolve, reject) => {
      const MAX_REDIRECTS = 5;
      const follow = (url: string, redirectsLeft: number) => {
        if (!isAllowedUpdateUrl(url)) {
          reject(new Error("Update download blocked: untrusted or non-https URL"));
          return;
        }
        https.get(url, { headers: { "User-Agent": "Largs-Hub-Updater" } }, (res) => {
          // Follow redirects (GitHub uses 302)
          if (res.statusCode === 301 || res.statusCode === 302) {
            if (redirectsLeft <= 0 || !res.headers.location) {
              reject(new Error("Update download failed: too many redirects"));
              return;
            }
            return follow(res.headers.location, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
          let downloaded = 0;
          const hash = crypto.createHash("sha256");
          const file = fs.createWriteStream(tmpPath);

          res.on("data", (chunk: Buffer) => {
            downloaded += chunk.length;
            hash.update(chunk);
            if (totalBytes > 0 && deps.getMainWindow()) {
              deps.getUiView()?.webContents.send("update-download-progress", {
                percent: Math.round((downloaded / totalBytes) * 100),
              });
            }
          });

          res.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              // Verify the download against the sha256 digest GitHub publishes
              // for the release asset before executing anything.
              const actualSha256 = hash.digest("hex");
              if (expectedSha256 && actualSha256 !== expectedSha256) {
                fs.unlink(tmpPath, () => {});
                reject(new Error("Update rejected: checksum mismatch"));
                return;
              }
              // Launch the NSIS installer silently in a fully detached process.
              // Args match what electron-updater uses: `--updated` marks this as
              // an update rather than a fresh install, and `--force-run` is what
              // makes a *silent* installer relaunch the app when it finishes —
              // without it the installer exits quietly and the app never
              // reopens.
              const child = spawn(tmpPath, ["--updated", "/S", "--force-run"], {
                detached: true,
                stdio: "ignore",
                windowsHide: true,
              });
              child.on("error", (err) => {
                reject(err);
              });
              child.unref();
              // Give the spawned process a moment to start before quitting.
              // Force-exit so nothing (a stray window handler, a pending IPC)
              // can keep the old instance alive and block the installer.
              setTimeout(() => {
                resolve();
                app.quit();
                setTimeout(() => app.exit(0), 2000);
              }, 1000);
            });
          });

          file.on("error", (err: Error) => {
            fs.unlink(tmpPath, () => {});
            reject(err);
          });
        }).on("error", reject);
      };

      follow(updateUrl, MAX_REDIRECTS);
    });
  });
}
