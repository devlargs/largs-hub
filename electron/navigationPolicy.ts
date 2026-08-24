// Which URLs may replace the page inside a logged-in service view, and which
// are treated as external links.
//
// This guard is what stops an arbitrary page from rendering inside a service's
// session partition — with that partition's cookies and permission grants (the
// Messenger and WhatsApp partitions have camera and mic allowed). It used to
// match domains with a bare `endsWith` in both directions, so a service on
// notion.so accepted `evilnotion.so`, and a service on web.whatsapp.com
// accepted any host that was a suffix of it (issue #68).
//
// Pure and Electron-free so it can be unit-tested (test/navigationPolicy.test.ts).

// Auth and CDN domains that a service may legitimately hand off to.
export const IN_VIEW_ALLOWED_DOMAINS = [
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "facebook.com",
  "fbcdn.net",
  "messenger.com",
  "apple.com",
  "icloud.com",
  "microsoft.com",
  "live.com",
  "microsoftonline.com",
  "github.com",
  "slack.com",
  "discord.com",
  "discordapp.com",
  "telegram.org",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "notion.so",
  "notion-static.com",
  "reddit.com",
  "redditstatic.com",
  "whatsapp.com",
  "whatsapp.net",
];

/**
 * True when `host` is `domain` or a subdomain of it.
 *
 * The dot is the whole point: without it "evilnotion.so".endsWith("notion.so")
 * is true, which is exactly the hole this closes.
 */
export function isSameDomain(host: string, domain: string): boolean {
  if (!host || !domain) return false;
  return host === domain || host.endsWith("." + domain);
}

/** Strips a leading "www." so the comparisons below don't have to care. */
export function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

/**
 * Whether `targetUrl` may navigate inside the service view.
 *
 * Both directions are still checked — a service registered as `messenger.com`
 * should accept `web.messenger.com` and vice versa — but each direction now
 * requires a real domain boundary.
 */
export function shouldKeepInView(
  targetUrl: string,
  serviceHost: string | null | undefined,
  allowedDomains: readonly string[] = IN_VIEW_ALLOWED_DOMAINS,
): boolean {
  let host: string;
  try {
    host = normalizeHost(new URL(targetUrl).hostname);
  } catch {
    return false;
  }
  if (!host) return false;

  if (serviceHost) {
    const service = normalizeHost(serviceHost);
    if (isSameDomain(host, service) || isSameDomain(service, host)) return true;
  }
  return allowedDomains.some((domain) => isSameDomain(host, domain));
}
