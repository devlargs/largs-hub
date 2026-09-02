// Chrome impersonation for service views.
//
// Spoofing the User-Agent string alone is no longer enough: Chromium also sends
// User-Agent Client Hints, and in Electron those hints advertise the runtime —
// `Sec-CH-UA: "Chromium";v="140", "Electron";v="38", "Not=A?Brand";v="24"`.
// Google's sign-in reads them, sees a non-browser brand and answers with
// "Couldn't sign you in — this browser or app may not be secure" (issue #106).
// `setUserAgent()` does not touch those headers, so they have to be rewritten on
// the way out.
//
// Pure and Electron-free so it can be unit-tested (test/userAgent.test.ts).

/** Chrome's own GREASE brand, kept so the set looks like a stock browser's. */
const GREASE_BRAND = "Not=A?Brand";

/** Major version out of a full Chromium version like "140.0.7339.207". */
export function chromeMajorVersion(fullVersion: string): string {
  return /^(\d+)/.exec(fullVersion)?.[1] ?? "0";
}

/** The desktop-Chrome UA string a service view claims. */
export function spoofedUserAgent(fullVersion: string): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`;
}

/**
 * Client hints Chromium sends on every secure request without being asked.
 * These are the ones Google's sign-in checks, and the ones that name Electron.
 */
export function lowEntropyClientHints(fullVersion: string): Record<string, string> {
  const major = chromeMajorVersion(fullVersion);
  return {
    "sec-ch-ua": `"Chromium";v="${major}", "Google Chrome";v="${major}", "${GREASE_BRAND}";v="99"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };
}

/**
 * Hints a site only receives after asking for them via `Accept-CH`. They are
 * rewritten when present but never added, so the app volunteers no more about
 * itself than Chrome would.
 */
export function highEntropyClientHints(fullVersion: string): Record<string, string> {
  return {
    "sec-ch-ua-full-version-list": `"Chromium";v="${fullVersion}", "Google Chrome";v="${fullVersion}", "${GREASE_BRAND}";v="99.0.0.0"`,
    "sec-ch-ua-full-version": `"${fullVersion}"`,
    "sec-ch-ua-arch": '"x86"',
    "sec-ch-ua-bitness": '"64"',
    "sec-ch-ua-model": '""',
    "sec-ch-ua-platform-version": '"15.0.0"',
    "sec-ch-ua-wow64": "?0",
  };
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
 * it would not otherwise have had is itself a tell.
 */
export function withChromeIdentityHeaders(
  headers: Record<string, string | string[]>,
  fullVersion: string,
): Record<string, string | string[]> {
  const high = highEntropyClientHints(fullVersion);
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

  out["User-Agent"] = spoofedUserAgent(fullVersion);
  if (sawHints) {
    for (const [name, value] of Object.entries(lowEntropyClientHints(fullVersion))) {
      out[name] = value;
    }
    for (const name of requested) out[name] = high[name];
  }

  return out;
}
