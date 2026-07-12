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
      if (latest && latest !== current) {
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

    const tmpPath = path.join(app.getPath("temp"), "largs-hub-update.exe");

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
              // The installer will replace app files and auto-relaunch when done.
              const child = spawn(tmpPath, ["/S"], {
                detached: true,
                stdio: "ignore",
                windowsHide: true,
              });
              child.unref();
              // Give the spawned process a moment to start before quitting
              setTimeout(() => {
                app.quit();
                resolve();
              }, 500);
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
