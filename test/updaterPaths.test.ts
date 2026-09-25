import { describe, expect, it } from "vitest";
import {
  LEGACY_INSTALLER_NAMES,
  UPDATE_DIR_PREFIX,
  installerFileName,
  staleUpdateEntries,
} from "../electron/updater/paths";

describe("installerFileName", () => {
  it("uses the platform's installer extension", () => {
    expect(installerFileName("win32", "ab12")).toBe("largs-hub-update-ab12.exe");
    expect(installerFileName("darwin", "ab12")).toBe("largs-hub-update-ab12.dmg");
  });

  it("is not one of the old predictable names", () => {
    for (const platform of ["win32", "darwin"] as const) {
      expect(LEGACY_INSTALLER_NAMES).not.toContain(installerFileName(platform, "ab12"));
    }
  });
});

describe("staleUpdateEntries", () => {
  it("picks update directories and legacy installers", () => {
    expect(
      staleUpdateEntries(
        [`${UPDATE_DIR_PREFIX}x1`, "largs-hub-update.exe", "largs-hub-update.dmg", "notes.txt"],
        null,
      ),
    ).toEqual([`${UPDATE_DIR_PREFIX}x1`, "largs-hub-update.exe", "largs-hub-update.dmg"]);
  });

  it("keeps the current download's directory", () => {
    expect(
      staleUpdateEntries(
        [`${UPDATE_DIR_PREFIX}a`, `${UPDATE_DIR_PREFIX}b`],
        `${UPDATE_DIR_PREFIX}b`,
      ),
    ).toEqual([`${UPDATE_DIR_PREFIX}a`]);
  });

  it("leaves the macOS update log and the script's DMG mount point alone", () => {
    expect(staleUpdateEntries(["largs-hub-update.log", "largs-hub-update.Ab3dEf"], null)).toEqual(
      [],
    );
  });
});
