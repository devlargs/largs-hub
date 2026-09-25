// Which URLs may replace the page inside a logged-in service view, and which
// are treated as external links.
//
// This guard is what stops an arbitrary page from rendering inside a service's
// session partition — with that partition's cookies. (Camera and mic are
// judged separately, by the asking page's origin: servicePermissions.ts, so
// an allowlisted domain here never inherits them — issue #114.) It used to
// match domains with a bare `endsWith` in both directions, so a service on
// notion.so accepted `evilnotion.so`, and a service on web.whatsapp.com
// accepted any host that was a suffix of it (issue #68).
//
// Pure and Electron-free so it can be unit-tested (test/navigationPolicy.test.ts).

// Auth and CDN domains that a service may legitimately hand off to. Sign-in
// also passes through some of these by server redirect (Google sets its cookie
// on youtube.com, Microsoft hops between live.com, office.com and
// microsoftonline.com), and since redirects are checked too (issue #123) each
// hop has to be listed.
export const IN_VIEW_ALLOWED_DOMAINS = [
  "google.com",
  "youtube.com",
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
  "office.com",
  "office365.com",
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

/**
 * Whether the service view's main frame may show `url` at all (issue #123):
 * an http(s) page that stays in view, or a blob: URL minted by such a page.
 * Every other scheme (file:, data:, about:, custom handlers) is refused, so the
 * view never renders something that isn't the service or its sign-in.
 */
export function mayShowInView(
  url: string,
  serviceHost: string | null | undefined,
  allowedDomains: readonly string[] = IN_VIEW_ALLOWED_DOMAINS,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "blob:") {
    // A blob URL carries its creator's origin ("blob:https://host/uuid").
    const origin = parsed.origin;
    return /^https?:/.test(origin) && shouldKeepInView(origin, serviceHost, allowedDomains);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return shouldKeepInView(url, serviceHost, allowedDomains);
}

export interface RedirectContext {
  /** Where the redirect goes. */
  url: string;
  serviceHost: string | null | undefined;
  /** The URL this main-frame navigation started at, before any redirect. */
  startUrl: string | null;
  /** True when a page started the navigation, false when the app did. */
  pageInitiated: boolean;
  /** The service's own URL, as the user set it up. */
  homeUrl: string;
}

function sameUrl(a: string | null, b: string): boolean {
  if (!a) return false;
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

/**
 * Whether a server redirect of the service view's main frame may be followed
 * (issue #123). Open redirects are common on the allowlisted domains
 * (google.com/url?q=…, l.facebook.com), so a link that stays in view could
 * otherwise bounce the view onto any site, logged-in cookies and all. A
 * redirect has to land somewhere the view may show, with one exception: the
 * app loading the service's own URL may follow wherever that server sends it,
 * the way the user's browser would, so a service set up at a URL that forwards
 * to its real home or sign-in still opens.
 */
export function mayRedirectInView(
  { url, serviceHost, startUrl, pageInitiated, homeUrl }: RedirectContext,
  allowedDomains: readonly string[] = IN_VIEW_ALLOWED_DOMAINS,
): boolean {
  if (mayShowInView(url, serviceHost, allowedDomains)) return true;
  if (pageInitiated) return false;
  return sameUrl(startUrl, homeUrl) && /^https?:/i.test(url);
}
