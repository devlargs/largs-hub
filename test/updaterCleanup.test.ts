import path from "path";
import { describe, expect, it } from "vitest";
import { UpdateCleanupFs, removeStaleUpdates } from "../electron/updater";

const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

// A fake fs listing `entries`, recording what it was asked to delete and
// failing with `locked` for the names in it.
function fakeFs(entries: string[], seen: string[], locked: Record<string, string> = {}) {
  const fsLike: UpdateCleanupFs = {
    readdir: () => Promise.resolve(entries),
    rm(target) {
      const name = path.basename(target);
      if (locked[name]) return Promise.reject(errno(locked[name]));
      seen.push(target);
      return Promise.resolve();
    },
  };
  return fsLike;
}

const TEMP = path.join("C:", "temp");

describe("removeStaleUpdates", () => {
  it("removes earlier update directories and legacy installers only", async () => {
    const seen: string[] = [];
    const entries = [
      "largs-hub-dl-a1",
      "largs-hub-update.exe",
      "other.txt",
      "largs-hub-update.log",
    ];
    await expect(removeStaleUpdates(TEMP, null, fakeFs(entries, seen))).resolves.toBe(2);
    expect(seen).toEqual([
      path.join(TEMP, "largs-hub-dl-a1"),
      path.join(TEMP, "largs-hub-update.exe"),
    ]);
  });

  it("leaves the directory of a download in progress alone", async () => {
    const seen: string[] = [];
    const entries = ["largs-hub-dl-old", "largs-hub-dl-now"];
    await removeStaleUpdates(TEMP, path.join(TEMP, "largs-hub-dl-now"), fakeFs(entries, seen));
    expect(seen).toEqual([path.join(TEMP, "largs-hub-dl-old")]);
  });

  it("skips what is still locked rather than throwing", async () => {
    // NSIS may still hold the installer right after --force-run relaunches us
    const seen: string[] = [];
    const entries = ["largs-hub-dl-busy", "largs-hub-dl-perm", "largs-hub-dl-free"];
    const fsLike = fakeFs(entries, seen, {
      "largs-hub-dl-busy": "EBUSY",
      "largs-hub-dl-perm": "EPERM",
    });
    await expect(removeStaleUpdates(TEMP, null, fsLike)).resolves.toBe(1);
    expect(seen).toEqual([path.join(TEMP, "largs-hub-dl-free")]);
  });

  it("resolves 0 when the temp folder can't be read", async () => {
    const fsLike: UpdateCleanupFs = {
      readdir: () => Promise.reject(errno("ENOENT")),
      rm: () => Promise.resolve(),
    };
    await expect(removeStaleUpdates(TEMP, null, fsLike)).resolves.toBe(0);
  });
});
