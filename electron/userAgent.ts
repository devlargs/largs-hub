// Chrome impersonation for service views.
//
// Spoofing the User-Agent string alone is no longer enough: Chromium also sends
// User-Agent Client Hints, and in Electron those hints advertise the runtime —
// `Sec-CH-UA: "Chromium";v="140", "Electron";v="38", "Not=A?Brand";v="24"`.
// Google's sign-in reads them, sees a non-browser brand and answers with
// "Couldn't sign you in — this browser or app may not be secure" (issue #106).
// It reads the same values from `navigator.userAgentData` in the page, too, and
// flags a UA that says Windows on a Mac (issue #113). So one identity, built
// here for the platform the app is actually running on, drives the UA string,
// the request headers and the page-visible metadata alike.
//
// Pure apart from reading the host in currentChromeIdentity(), and
// Electron-free, so it can be unit-tested (test/userAgent.test.ts).

import os from "os";

/** Chrome's own GREASE brand, kept so the set looks like a stock browser's. */
const GREASE_BRAND = "Not=A?Brand";

export type HostOs = "windows" | "macos" | "linux";

/** What a real Chrome on this machine would report about the OS and CPU. */
export interface HostPlatform {
  os: HostOs;
  /** Sec-CH-UA-Platform-Version, e.g. "15.0.0" (Windows 11) or "15.1.0" (macOS 15.1). */
  platformVersion: string;
  arch: "x86" | "arm";
  bitness: "64" | "32";
}

/** The shape of CDP's Emulation.UserAgentMetadata. */
export interface UserAgentMetadata {
  brands: { brand: string; version: string }[];
  fullVersionList: { brand: string; version: string }[];
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
  bitness: string;
  wow64: boolean;
}

/** Everything a service view claims to be, derived from one fullVersion + host. */
export interface ChromeIdentity {
  userAgent: string;
  /** navigator.platform, which Chrome still reports un-frozen. */
  navigatorPlatform: string;
  /** Page-visible navigator.userAgentData, set through Chromium itself. */
  metadata: UserAgentMetadata;
  /** Hints Chromium sends on every secure request without being asked. */
  lowEntropyHints: Record<string, string>;
  /** Hints a site only gets after asking via Accept-CH. */
  highEntropyHints: Record<string, string>;
}

/** Major version out of a full Chromium version like "140.0.7339.207". */
export function chromeMajorVersion(fullVersion: string): string {
  return /^(\d+)/.exec(fullVersion)?.[1] ?? "0";
}

/**
 * macOS version from the Darwin kernel release (`os.release()`). Darwin 20–24
 * are macOS 11–15; Apple then jumped to 26 with Darwin 25. The Darwin minor
 * tracks the macOS minor. Chrome reports this real version in
 * Sec-CH-UA-Platform-Version, even though its UA string is frozen at 10_15_7.
 */
export function macOsVersion(darwinRelease: string): string {
  const [major, minor] = darwinRelease.split(".").map((n) => parseInt(n, 10));
  if (!Number.isFinite(major) || major < 20) return "10.15.7";
  const macMajor = major >= 25 ? major + 1 : major - 9;
  return `${macMajor}.${Number.isFinite(minor) ? minor : 0}.0`;
}

/**
 * Windows' Sec-CH-UA-Platform-Version is the UniversalApiContract version, not
 * the NT version (which is 10.0 for both Windows 10 and 11). These are the
 * values Chrome reports for each build `os.release()` can return.
 */
export function windowsPlatformVersion(ntRelease: string): string {
  const build = parseInt(ntRelease.split(".")[2] ?? "", 10);
  if (!Number.isFinite(build)) return "10.0.0";
  if (build >= 26100) return "19.0.0"; // Windows 11 24H2+
  if (build >= 22621) return "15.0.0"; // Windows 11 22H2 / 23H2
  if (build >= 22000) return "14.0.0"; // Windows 11 21H2
  return "10.0.0"; // Windows 10
}

/** Map Node's process.platform / os.release() / process.arch to what Chrome reports. */
export function detectHostPlatform(platform: string, release: string, arch: string): HostPlatform {
  const cpu = arch === "arm64" || arch === "arm" ? "arm" : "x86";
  const bitness = arch === "ia32" || arch === "arm" ? "32" : "64";
  if (platform === "darwin") {
    return { os: "macos", platformVersion: macOsVersion(release), arch: cpu, bitness };
  }
  if (platform === "win32") {
    return { os: "windows", platformVersion: windowsPlatformVersion(release), arch: cpu, bitness };
  }
  const version = /^(\d+)\.(\d+)\.(\d+)/.exec(release);
  return {
    os: "linux",
    platformVersion: version ? `${version[1]}.${version[2]}.${version[3]}` : "",
    arch: cpu,
    bitness,
  };
}

// Chrome's UA-reduced strings: the OS token is frozen per platform, whatever
// the real OS version or CPU (Apple Silicon Macs still say "Intel").
const UA_OS_TOKEN: Record<HostOs, string> = {
  windows: "Windows NT 10.0; Win64; x64",
  macos: "Macintosh; Intel Mac OS X 10_15_7",
  linux: "X11; Linux x86_64",
};

const HINT_PLATFORM: Record<HostOs, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const NAVIGATOR_PLATFORM: Record<HostOs, string> = {
  windows: "Win32",
  macos: "MacIntel",
  linux: "Linux x86_64",
};

const quote = (value: string) => `"${value}"`;
const brandList = (brands: { brand: string; version: string }[]) =>
  brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(", ");

/** The full desktop-Chrome identity for `fullVersion` on `host`. */
export function chromeIdentity(fullVersion: string, host: HostPlatform): ChromeIdentity {
  const major = chromeMajorVersion(fullVersion);
  const brands = [
    { brand: "Chromium", version: major },
    { brand: "Google Chrome", version: major },
    { brand: GREASE_BRAND, version: "99" },
  ];
  const fullVersionList = [
    { brand: "Chromium", version: fullVersion },
    { brand: "Google Chrome", version: fullVersion },
    { brand: GREASE_BRAND, version: "99.0.0.0" },
  ];
  const platform = HINT_PLATFORM[host.os];
  const metadata: UserAgentMetadata = {
    brands,
    fullVersionList,
    fullVersion,
    platform,
    platformVersion: host.platformVersion,
    architecture: host.arch,
    model: "",
    mobile: false,
    bitness: host.bitness,
    wow64: false,
  };

  return {
    userAgent: `Mozilla/5.0 (${UA_OS_TOKEN[host.os]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`,
    navigatorPlatform: NAVIGATOR_PLATFORM[host.os],
    metadata,
    // Header values are spelled out from the metadata, so the two can't drift.
    lowEntropyHints: {
      "sec-ch-ua": brandList(brands),
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": quote(platform),
    },
    highEntropyHints: {
      "sec-ch-ua-full-version-list": brandList(fullVersionList),
      "sec-ch-ua-full-version": quote(fullVersion),
      "sec-ch-ua-arch": quote(host.arch),
      "sec-ch-ua-bitness": quote(host.bitness),
      "sec-ch-ua-model": quote(""),
      "sec-ch-ua-platform-version": quote(host.platformVersion),
      "sec-ch-ua-wow64": "?0",
    },
  };
}

let current: ChromeIdentity | null = null;

/** The identity for this machine and this build's Chromium. Computed once. */
export function currentChromeIdentity(): ChromeIdentity {
  current ??= chromeIdentity(
    process.versions.chrome ?? "0",
    detectHostPlatform(process.platform, os.release(), process.arch),
  );
  return current;
}

/**
 * Rewrites one outgoing request's headers so nothing in them names Electron.
 *
 * Header names are case-insensitive and Chromium's casing has shifted between
 * versions, so existing `sec-ch-ua*` keys are dropped by lowercase name before
 * the Chrome values are written back — otherwise both would go out. The
 * User-Agent is forced here as well, since popups and sub-frames can issue
 * requests before `setUserAgent()` has applied to them.
 *
 * Hints are only written back when the request already carried some: Chromium
 * omits them on insecure origins, and a request that grew a `Sec-CH-UA` header
 * it would not otherwise have had is itself a tell. High-entropy hints are
 * rewritten when present but never added, so the app volunteers no more about
 * itself than Chrome would.
 */
export function withChromeIdentityHeaders(
  headers: Record<string, string | string[]>,
  identity: ChromeIdentity,
): Record<string, string | string[]> {
  const high = identity.highEntropyHints;
  const out: Record<string, string | string[]> = {};
  const requested = new Set<string>();
  let sawHints = false;

  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "user-agent") continue;
    if (lower.startsWith("sec-ch-ua")) {
      sawHints = true;
      if (lower in high) requested.add(lower);
      continue;
    }
    out[name] = value;
  }

  out["User-Agent"] = identity.userAgent;
  if (sawHints) {
    for (const [name, value] of Object.entries(identity.lowEntropyHints)) {
      out[name] = value;
    }
    for (const name of requested) out[name] = high[name];
  }

  return out;
}
