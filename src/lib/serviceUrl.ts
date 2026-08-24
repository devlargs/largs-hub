// Service URL normalisation for the add/edit form (issue #78).
//
// The main process rejects a service whose URL isn't http(s) by returning the
// service list unchanged, which the renderer then treats as the new truth — so
// a typo used to close the modal as if the save had worked and silently drop
// the edit. Validating here means the invalid value never reaches that path.
//
// Pure and dependency-free so it can be unit-tested (test/serviceUrl.test.ts).

/**
 * Returns a canonical http(s) URL, or null if `raw` can't be one.
 *
 * A bare host gets an `https://` prefix — typing "mail.proton.me" is the
 * common case, and rejecting it would be pedantic. Anything that already
 * carries a scheme is taken at its word, so "htps://x.com" fails rather than
 * being silently repaired into something the user didn't ask for.
 */
export function normalizeServiceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // "https://" alone parses but has nowhere to go
  if (!url.hostname) return null;
  return url.toString();
}
