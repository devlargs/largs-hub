import fs from "fs";
import https from "https";
import crypto from "crypto";
import { isAllowedUpdateUrl } from "./release";
import { downloadProblem, isRedirectStatus, parseContentLength } from "./verify";

const MAX_REDIRECTS = 5;
// Give up when the connection goes quiet this long (connecting, or between
// chunks), rather than leaving the Settings page on "Downloading…" forever.
const IDLE_TIMEOUT_MS = 30_000;

/**
 * Downloads `url` to `destPath`, following GitHub's redirects (each hop must
 * pass the host allowlist), and verifies its size and its sha256 against
 * `expectedSha256` before resolving. There is no unverified path: the caller
 * refuses to install an update GitHub gave no checksum for (issue #122).
 * Anything that goes wrong (a dropped connection, a timeout, a short read, a
 * mismatch) deletes the file and rejects. `onProgress` gets a whole percentage
 * when the size is known.
 */
export function downloadVerified(
  url: string,
  expectedSha256: string,
  destPath: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      fs.unlink(destPath, () => {});
      reject(err);
    };

    // Only the latest hop's request and response can fail the download: a
    // redirect's leftovers (its socket timing out later) are ignored.
    let currentReq: ReturnType<typeof https.get> | null = null;

    const follow = (hopUrl: string, redirectsLeft: number) => {
      if (!isAllowedUpdateUrl(hopUrl)) {
        fail(new Error("Update download blocked: untrusted or non-https URL"));
        return;
      }
      const req = https.get(hopUrl, { headers: { "User-Agent": "Largs-Hub-Updater" } }, (res) => {
        if (isRedirectStatus(res.statusCode)) {
          res.resume();
          const location = res.headers.location;
          if (redirectsLeft <= 0 || !location) {
            fail(new Error("Update download failed: too many redirects"));
            return;
          }
          // A relative Location resolves against the hop that sent it.
          follow(new URL(location, hopUrl).href, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          fail(new Error(`Download failed: ${res.statusCode}`));
          return;
        }

        res.on("error", fail);
        res.on("aborted", () => fail(new Error("Update download interrupted")));

        const expectedBytes = parseContentLength(res.headers["content-length"]);
        let receivedBytes = 0;
        const hash = crypto.createHash("sha256");
        const file = fs.createWriteStream(destPath);

        res.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          hash.update(chunk);
          if (expectedBytes) onProgress(Math.round((receivedBytes / expectedBytes) * 100));
        });

        res.pipe(file);

        file.on("error", (err: Error) => {
          req.destroy();
          fail(err);
        });
        file.on("finish", () => {
          file.close(() => {
            // A response cut off mid-body can still end the pipe cleanly.
            if (!res.complete) {
              fail(new Error("Update download interrupted"));
              return;
            }
            const problem = downloadProblem({
              expectedSha256,
              actualSha256: hash.digest("hex"),
              expectedBytes,
              receivedBytes,
            });
            if (problem) {
              fail(new Error(problem));
              return;
            }
            if (!settled) {
              settled = true;
              resolve();
            }
          });
        });
      });
      currentReq = req;
      req.setTimeout(IDLE_TIMEOUT_MS, () => {
        if (req === currentReq && !settled) req.destroy(new Error("Update download timed out"));
      });
      req.on("error", (err) => {
        if (req === currentReq) fail(err);
      });
    };

    follow(url, MAX_REDIRECTS);
  });
}
