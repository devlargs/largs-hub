// A Firefox identity for Google's sign-in pages (issue #106).
//
// Service views look like desktop Chrome everywhere (userAgent.ts), and on
// Google's sign-in page that isn't enough. It checks that a browser calling
// itself Chrome has Chrome's page environment too (window.chrome.app,
// chrome.csi(), chrome.loadTimes() and the like), which come from the Chrome
// browser itself and not from the Chromium engine Electron ships, and answers
// "Couldn't sign you in — this browser or app may not be secure" when they're
// missing. It holds Firefox to no such check. So while the top-level page is on
// a sign-in host, the view calls itself Firefox: the UA string, no Client Hints
// (Firefox sends none), and a matching navigator.userAgent and platform. Other
// Electron workspace apps get past the same block the same way.
//
// Pure and Electron-free, so it can be unit-tested (test/signInIdentity.test.ts).

import type { HostOs } from "./userAgent";

/** Hosts whose pages get the Firefox identity. */
const SIGN_IN_HOSTS = new Set(["accounts.google.com"]);

/** Whether `url` is on a sign-in host. */
export function isSignInUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && SIGN_IN_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Firefox ships a release every four weeks; 143 came out on 2025-09-16.
const FIREFOX_ANCHOR_VERSION = 143;
const FIREFOX_ANCHOR_DATE = Date.UTC(2025, 8, 16);
const FIREFOX_CYCLE_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * A current Firefox release version for `now`, worked out from the release
 * cadence so it never goes stale. It claims the release before the one the
 * cadence predicts, so a slipped schedule can't make it name a Firefox that
 * isn't out yet.
 */
export function firefoxVersion(now: Date): number {
  const cycles = Math.floor((now.getTime() - FIREFOX_ANCHOR_DATE) / FIREFOX_CYCLE_MS);
  return FIREFOX_ANCHOR_VERSION + Math.max(0, cycles - 1);
}

// Firefox's frozen OS tokens: macOS always says 10.15, whatever the version,
// and Windows says Win64; x64 on ARM too.
const FIREFOX_OS_TOKEN: Record<HostOs, string> = {
  windows: "Windows NT 10.0; Win64; x64",
  macos: "Macintosh; Intel Mac OS X 10.15",
  linux: "X11; Linux x86_64",
};

const FIREFOX_NAVIGATOR_PLATFORM: Record<HostOs, string> = {
  windows: "Win32",
  macos: "MacIntel",
  linux: "Linux x86_64",
};

export interface SignInIdentity {
  userAgent: string;
  navigatorPlatform: string;
}

/** Desktop Firefox `version` on `os`. */
export function signInIdentity(os: HostOs, version: number): SignInIdentity {
  return {
    userAgent: `Mozilla/5.0 (${FIREFOX_OS_TOKEN[os]}; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`,
    navigatorPlatform: FIREFOX_NAVIGATOR_PLATFORM[os],
  };
}

export interface RequestContext {
  /** The request's own URL. */
  url: string;
  /** Electron's webRequest resourceType. */
  resourceType: string;
  /**
   * Whether the view the request comes from is showing a sign-in page, as
   * tracked from its main-frame navigations; undefined when it isn't tracked
   * (no view, e.g. a service worker, or one without the identity applied).
   */
  pageIsSignIn: boolean | undefined;
  /** The view's current URL, the fallback when it isn't tracked. */
  pageUrl: string | undefined;
}

/**
 * Whether a request goes out as Firefox. A top-level navigation goes by where
 * it's headed; everything else by the page it belongs to, so a sign-in page's
 * scripts and calls match it, and an accounts.google.com frame inside Gmail
 * stays Chrome like the Gmail page around it.
 */
export function requestUsesSignInIdentity(request: RequestContext): boolean {
  if (request.resourceType === "mainFrame") return isSignInUrl(request.url);
  if (request.pageIsSignIn !== undefined) return request.pageIsSignIn;
  return isSignInUrl(request.pageUrl ?? request.url);
}

/**
 * Rewrites one request's headers as Firefox's: its User-Agent, and no Client
 * Hints at all, since Firefox doesn't send any.
 */
export function withSignInHeaders(
  headers: Record<string, string | string[]>,
  identity: SignInIdentity,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "user-agent" || lower.startsWith("sec-ch-ua")) continue;
    out[name] = value;
  }
  out["User-Agent"] = identity.userAgent;
  return out;
}
