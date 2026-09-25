import { describe, expect, it } from "vitest";
import { parseSha256Digest, releasePageUrl, resolveUpdate } from "../electron/updater";

const SHA = "a".repeat(64);

const exe = {
  name: "Largs-Hub-Setup-0.2.0.exe",
  browser_download_url:
    "https://github.com/devlargs/largs-hub/releases/download/v0.2.0/Largs-Hub-Setup-0.2.0.exe",
  digest: `sha256:${SHA}`,
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
      sha256: SHA,
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

describe("parseSha256Digest", () => {
  it("takes the hex from a sha256 digest, lowercased", () => {
    expect(parseSha256Digest(`sha256:${SHA}`)).toBe(SHA);
    expect(parseSha256Digest(`SHA256:${"AB".repeat(32)}`)).toBe("ab".repeat(32));
  });

  it("refuses anything that isn't a whole sha256", () => {
    expect(parseSha256Digest(undefined)).toBeNull();
    expect(parseSha256Digest("")).toBeNull();
    expect(parseSha256Digest("sha256:")).toBeNull();
    expect(parseSha256Digest("sha256:abc123")).toBeNull();
    expect(parseSha256Digest(`sha256:${SHA}0`)).toBeNull();
    expect(parseSha256Digest(`sha256:${"g".repeat(64)}`)).toBeNull();
    expect(parseSha256Digest(`md5:${SHA}`)).toBeNull();
    expect(parseSha256Digest(42)).toBeNull();
  });
});

describe("releasePageUrl", () => {
  it("links the release's tag page", () => {
    expect(releasePageUrl("0.2.0")).toBe(
      "https://github.com/devlargs/largs-hub/releases/tag/v0.2.0",
    );
  });
});
