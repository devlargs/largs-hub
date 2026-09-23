import fs from "fs";
import https from "https";
import crypto from "crypto";
import { isAllowedUpdateUrl } from "./release";

const MAX_REDIRECTS = 5;

/**
 * Downloads `url` to `destPath`, following GitHub's redirects (each hop must
 * pass the host allowlist), and verifies it against `expectedSha256` before
 * resolving. A failed or mismatched download is deleted and rejects.
 * `onProgress` gets a whole percentage when the size is known.
 */
export function downloadVerified(
  url: string,
  expectedSha256: string | null,
  destPath: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const follow = (hopUrl: string, redirectsLeft: number) => {
      if (!isAllowedUpdateUrl(hopUrl)) {
        reject(new Error("Update download blocked: untrusted or non-https URL"));
        return;
      }
      https
        .get(hopUrl, { headers: { "User-Agent": "Largs-Hub-Updater" } }, (res) => {
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
          const file = fs.createWriteStream(destPath);

          res.on("data", (chunk: Buffer) => {
            downloaded += chunk.length;
            hash.update(chunk);
            if (totalBytes > 0) onProgress(Math.round((downloaded / totalBytes) * 100));
          });

          res.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              // Verify the download against the sha256 digest GitHub publishes
              // for the release asset before executing anything.
              const actualSha256 = hash.digest("hex");
              if (expectedSha256 && actualSha256 !== expectedSha256) {
                fs.unlink(destPath, () => {});
                reject(new Error("Update rejected: checksum mismatch"));
                return;
              }
              resolve();
            });
          });

          file.on("error", (err: Error) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        })
        .on("error", reject);
    };

    follow(url, MAX_REDIRECTS);
  });
}
