import { describe, expect, it } from "vitest";
import { resolveUpdate } from "../electron/updater";

const exe = {
  name: "Largs-Hub-Setup-0.2.0.exe",
  browser_download_url:
    "https://github.com/devlargs/largs-hub/releases/download/v0.2.0/Largs-Hub-Setup-0.2.0.exe",
  digest: "sha256:abc123",
};
const armDmg = {
  name: "Largs-Hub-0.2.0-arm64.dmg",
  browser_download_url:
    "https://github.com/devlargs/largs-hub/releases/download/v0.2.0/Largs-Hub-0.2.0-arm64.dmg",
};

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: "v0.2.0",
  assets: [exe, armDmg],
  ...overrides,
});

describe("resolveUpdate", () => {
  it("offers a newer release's installer with its checksum", () => {
    expect(resolveUpdate(release(), "0.1.66", "win32", "x64")).toEqual({
      version: "0.2.0",
      url: exe.browser_download_url,
      sha256: "abc123",
    });
  });

  it("picks the Mac's own DMG, with no checksum when GitHub gave none", () => {
    expect(resolveUpdate(release(), "0.1.66", "darwin", "arm64")).toEqual({
      version: "0.2.0",
      url: armDmg.browser_download_url,
      sha256: null,
    });
  });

  it("offers nothing that isn't strictly newer", () => {
    expect(resolveUpdate(release(), "0.2.0", "win32", "x64")).toBeNull();
    expect(resolveUpdate(release(), "0.3.0", "win32", "x64")).toBeNull();
    expect(resolveUpdate(release({ tag_name: "v0.2.0-rc1" }), "0.1.0", "win32", "x64")).toBeNull();
  });

  it("offers nothing without an asset for this machine", () => {
    expect(resolveUpdate(release(), "0.1.66", "darwin", "x64")).toBeNull();
    expect(resolveUpdate(release(), "0.1.66", "linux", "x64")).toBeNull();
  });

  it("refuses an asset hosted anywhere but GitHub, or over http", () => {
    const elsewhere = { ...exe, browser_download_url: "https://example.com/setup.exe" };
    const plain = {
      ...exe,
      browser_download_url: exe.browser_download_url.replace("https", "http"),
    };
    expect(resolveUpdate(release({ assets: [elsewhere] }), "0.1.0", "win32", "x64")).toBeNull();
    expect(resolveUpdate(release({ assets: [plain] }), "0.1.0", "win32", "x64")).toBeNull();
  });

  it("ignores a digest that isn't sha256", () => {
    const md5 = { ...exe, digest: "md5:ffff" };
    expect(resolveUpdate(release({ assets: [md5] }), "0.1.0", "win32", "x64")?.sha256).toBeNull();
  });

  it("copes with a malformed answer", () => {
    expect(resolveUpdate(null, "0.1.0", "win32", "x64")).toBeNull();
    expect(resolveUpdate({ tag_name: 42 }, "0.1.0", "win32", "x64")).toBeNull();
    expect(resolveUpdate({ tag_name: "v9.9.9" }, "0.1.0", "win32", "x64")).toBeNull();
  });
});
