import { isNewerVersion } from "./version";

// Reading GitHub's "latest release" answer: which asset to install, where it
// may be downloaded from, and the checksum to verify it against. Pure
// (test/updaterAsset.test.ts, test/updaterRelease.test.ts).

export interface ReleaseAsset {
  name: string;
  browser_download_url?: string;
  digest?: string;
}

/**
 * Picks the release asset this machine should install: the NSIS `.exe` on
 * Windows, or the DMG built for this CPU on macOS (the release ships one per
 * arch, named `…-arm64.dmg` / `…-x64.dmg`). Anything else gets no update.
 */
export function pickUpdateAsset(
  assets: unknown,
  platform: NodeJS.Platform,
  arch: string,
): ReleaseAsset | null {
  if (!Array.isArray(assets)) return null;
  const named = assets.filter(
    (a): a is ReleaseAsset => typeof a?.name === "string" && !a.name.endsWith(".blockmap"),
  );
  if (platform === "win32") return named.find((a) => a.name.endsWith(".exe")) ?? null;
  if (platform === "darwin") {
    return named.find((a) => a.name.endsWith(`-${arch}.dmg`)) ?? null;
  }
  return null;
}

const UPDATE_HOST_ALLOWLIST = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

// Every hop of the download, redirects included, must pass this.
export function isAllowedUpdateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && UPDATE_HOST_ALLOWLIST.has(parsed.hostname);
  } catch {
    return false;
  }
}

// An update the main process has checked and will download. The renderer only
// ever sees the version; the URL and checksum stay here.
export interface PendingUpdate {
  version: string;
  url: string;
  // Hex sha256 the download must match, or null when GitHub gave none
  sha256: string | null;
}

/**
 * The update to offer from the latest-release JSON, or null when there is none
 * for this machine: not newer than `currentVersion`, no asset for this
 * platform/arch, or an asset hosted somewhere it may not be downloaded from.
 */
export function resolveUpdate(
  release: unknown,
  currentVersion: string,
  platform: NodeJS.Platform,
  arch: string,
): PendingUpdate | null {
  if (typeof release !== "object" || release === null) return null;
  const { tag_name, assets } = release as { tag_name?: unknown; assets?: unknown };
  const latest = (typeof tag_name === "string" ? tag_name : "").replace(/^v/, "");
  if (!isNewerVersion(latest, currentVersion)) return null;
  const asset = pickUpdateAsset(assets, platform, arch);
  const url = asset?.browser_download_url;
  if (!url || !isAllowedUpdateUrl(url)) return null;
  // GitHub publishes a sha256 digest per release asset
  const digest = asset?.digest;
  return {
    version: latest,
    url,
    sha256: digest?.startsWith("sha256:") ? digest.slice("sha256:".length) : null,
  };
}
