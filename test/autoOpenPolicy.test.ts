import { describe, expect, it } from "vitest";
import { isSafeToAutoOpen } from "../electron/autoOpenPolicy";

const PLATFORMS: NodeJS.Platform[] = ["win32", "darwin"];

// Types that run code, or open something that can, when handed to the OS.
const DANGEROUS = [
  "setup.exe",
  "run.bat",
  "run.cmd",
  "script.ps1",
  "page.hta",
  "shortcut.lnk",
  "link.url",
  "script.js",
  "script.vbs",
  "installer.msi",
  "screensaver.scr",
  "library.dll",
  "control.cpl",
  "launch.command",
  "installer.pkg",
  "App.app",
  "script.sh",
  "archive.zip",
  "disk.dmg",
  "disk.iso",
  "page.html",
  "page.htm",
  "image.svg",
  "macro.docm",
  "macro.xlsm",
  "legacy.doc",
  "legacy.xls",
  "rich.rtf",
];

const SAFE = ["report.pdf", "notes.txt", "data.csv", "letter.docx", "sheet.xlsx", "photo.JPG"];

describe("isSafeToAutoOpen", () => {
  for (const platform of PLATFORMS) {
    describe(platform, () => {
      it("opens documents, images and media", () => {
        for (const name of [...SAFE, "clip.mp4", "voice.m4a", "scan.png"]) {
          expect(isSafeToAutoOpen(name, platform), name).toBe(true);
        }
      });

      it("never opens executables, scripts, installers, archives or active documents", () => {
        for (const name of DANGEROUS) {
          expect(isSafeToAutoOpen(name, platform), name).toBe(false);
          expect(isSafeToAutoOpen(name.toUpperCase(), platform), name).toBe(false);
        }
      });

      it("goes by the last extension only", () => {
        expect(isSafeToAutoOpen("invoice.pdf.exe", platform)).toBe(false);
        expect(isSafeToAutoOpen("setup.exe.pdf", platform)).toBe(true);
      });

      it("refuses names with no extension and dotfiles", () => {
        expect(isSafeToAutoOpen("README", platform)).toBe(false);
        expect(isSafeToAutoOpen(".pdf", platform)).toBe(false);
        expect(isSafeToAutoOpen("", platform)).toBe(false);
      });

      it("checks only the file name when given a path", () => {
        expect(isSafeToAutoOpen("C:\\Users\\me\\Downloads\\a.pdf\\run.exe", platform)).toBe(false);
        expect(isSafeToAutoOpen("/Users/me/Downloads/run.exe/report.pdf", platform)).toBe(true);
      });
    });
  }

  it("sees through trailing dots and spaces on Windows", () => {
    expect(isSafeToAutoOpen("run.exe.", "win32")).toBe(false);
    expect(isSafeToAutoOpen("run.exe . .", "win32")).toBe(false);
    expect(isSafeToAutoOpen("report.pdf.", "win32")).toBe(true);
  });

  it("refuses alternate data streams on Windows", () => {
    expect(isSafeToAutoOpen("report.pdf:evil.exe", "win32")).toBe(false);
    expect(isSafeToAutoOpen("run.exe:stream.pdf", "win32")).toBe(false);
  });

  it("treats a trailing dot as no extension on macOS", () => {
    expect(isSafeToAutoOpen("report.pdf.", "darwin")).toBe(false);
  });
});
