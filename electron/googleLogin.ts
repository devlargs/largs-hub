// Which cookies make up a Google login, and how to copy them into a new
// service's partition (googleLoginShare.ts does the copying).
//
// Every service browses in its own partition, so a Google account signed in to
// in one service was unknown to the next one added. A new service now starts
// with the Google login of the service the user last signed in to Google from.
//
// Pure and Electron-free so it can be unit-tested (test/googleLogin.test.ts).

/** The parts of an Electron Cookie this module reads. */
export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  hostOnly?: boolean;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  session?: boolean;
  expirationDate?: number;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
}

/** What Electron's cookies.set() takes. */
export interface CookieToSet {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite: StoredCookie["sameSite"];
}

/**
 * Domains Google's sign-in writes its login to. Google also signs the account
 * in to youtube.com during sign-in, so that half travels with it.
 */
export const GOOGLE_LOGIN_DOMAINS = ["google.com", "youtube.com"];

/** Google's account cookie: present exactly while an account is signed in. */
export const GOOGLE_SIGN_IN_COOKIE = "SID";

function cookieHost(domain: string | undefined): string {
  return (domain ?? "").replace(/^\./, "").toLowerCase();
}

/** Whether a cookie belongs to the Google login. */
export function isGoogleLoginCookie(cookie: Pick<StoredCookie, "domain">): boolean {
  const host = cookieHost(cookie.domain);
  return GOOGLE_LOGIN_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

/** Whether a cookie is the one Google sets when an account signs in. */
export function isGoogleSignInCookie(cookie: Pick<StoredCookie, "name" | "domain">): boolean {
  return cookie.name === GOOGLE_SIGN_IN_COOKIE && cookieHost(cookie.domain) === "google.com";
}

/** Whether a partition's cookies hold a signed-in Google account. */
export function hasGoogleSignIn(
  cookies: readonly Pick<StoredCookie, "name" | "domain">[],
): boolean {
  return cookies.some(isGoogleSignInCookie);
}

/**
 * The cookies.set() call that recreates `cookie` in another partition. A
 * host-only cookie is set without a domain, so it stays host-only (which
 * __Host- cookies require); a domain cookie keeps its leading-dot domain.
 */
export function toCookieToSet(cookie: StoredCookie): CookieToSet {
  const host = cookieHost(cookie.domain);
  const path = cookie.path || "/";
  return {
    url: `https://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
    path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(cookie.session || cookie.expirationDate === undefined
      ? {}
      : { expirationDate: cookie.expirationDate }),
    sameSite: cookie.sameSite,
  };
}

/**
 * Which service's Google login a new service starts with: the one the user
 * last signed in to Google from, while it's still signed in, else the first
 * other service that is signed in. Null when none is.
 */
export function pickGoogleLoginSource(
  signedIn: readonly { id: string; signedIn: boolean }[],
  lastSignInId: string | null,
): string | null {
  const last = signedIn.find((s) => s.id === lastSignInId && s.signedIn);
  if (last) return last.id;
  return signedIn.find((s) => s.signedIn)?.id ?? null;
}
