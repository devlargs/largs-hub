import { describe, expect, it } from "vitest";
import {
  InstallerCleanupFs,
  UPDATE_INSTALLER_NAME,
  removeStaleInstaller,
} from "../electron/updater";

// A fake fs that records what it was asked to delete and replays a given error.
function fakeFs(err: NodeJS.ErrnoException | null, seen: string[] = []): InstallerCleanupFs {
  return {
    unlink(filePath, callback) {
      seen.push(filePath);
      callback(err);
    },
  };
}

const errno = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(code), { code });

describe("removeStaleInstaller", () => {
  it("reports the installer was removed", async () => {
    const seen: string[] = [];
    await expect(removeStaleInstaller("C:/temp/x.exe", fakeFs(null, seen))).resolves.toBe(true);
    expect(seen).toEqual(["C:/temp/x.exe"]);
  });

  it("reports false when there was nothing to remove", async () => {
    await expect(removeStaleInstaller("C:/temp/x.exe", fakeFs(errno("ENOENT")))).resolves.toBe(
      false,
    );
  });

  it("swallows a locked file rather than throwing", async () => {
    // NSIS may still hold the installer right after --force-run relaunches us
    await expect(removeStaleInstaller("C:/temp/x.exe", fakeFs(errno("EBUSY")))).resolves.toBe(
      false,
    );
    await expect(removeStaleInstaller("C:/temp/x.exe", fakeFs(errno("EPERM")))).resolves.toBe(
      false,
    );
  });
});

describe("UPDATE_INSTALLER_NAME", () => {
  it("is a fixed filename, so updates overwrite instead of accumulating", () => {
    expect(UPDATE_INSTALLER_NAME).toBe("largs-hub-update.exe");
    expect(UPDATE_INSTALLER_NAME).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
