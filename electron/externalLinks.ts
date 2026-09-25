// What may be handed to the OS with shell.openExternal (issue #119).
//
// openExternal launches whatever handler the OS has registered for a URL's
// scheme. A page in a service view, the link preview or a call window can call
// window.open with any scheme, and on Windows several are dangerous:
// `ms-msdt:` and `search-ms:` have been used for remote code execution,
// `ms-officecmd:` launches Office with attacker-chosen arguments, and
// `file:`/`smb:`/UNC paths run or reveal files from an attacker's share. So only
// a short allowlist gets through, and the URL is re-serialised from its parsed
// form so the OS sees exactly what was checked.
//
// Pure and Electron-free so it can be unit-tested (test/externalLinks.test.ts).

const WEB_SCHEMES = new Set(["http:", "https:"]);
// A service page may also hand off an email address or a phone number.
const SERVICE_SCHEMES = new Set([...WEB_SCHEMES, "mailto:", "tel:"]);

function allowedHref(url: unknown, schemes: Set<string>): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!schemes.has(parsed.protocol)) return null;
  if (WEB_SCHEMES.has(parsed.protocol) && !parsed.hostname) return null;
  return parsed.href;
}

/**
 * The URL to open in the system browser, or null to drop it. Only http(s) with
 * a host: used by the link preview, call windows, the UI view and the
 * "Open in browser" IPC, none of which have a reason to launch anything else.
 */
export function externalWebUrl(url: unknown): string | null {
  return allowedHref(url, WEB_SCHEMES);
}

/**
 * The URL a service view may hand to the OS, or null to drop it: http(s), plus
 * `mailto:` and `tel:` so email and phone links still open the mail app or
 * dialer.
 */
export function externalServiceUrl(url: unknown): string | null {
  return allowedHref(url, SERVICE_SCHEMES);
}
