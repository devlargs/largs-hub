import type { Session } from "electron";
import { BadgeAdapter } from "./types";

// Gmail's Atom feed reports the inbox unread count server-side, so it stays
// correct when the tab-title "(N)" is wrong or missing — the title only counts
// the focused inbox tab and disappears entirely with some display/tab settings
// (issue #26). The feed is cookie-authenticated: fetching it through the
// service's session reuses the existing login, no extra credentials needed.
// Note: the bare /mail/feed/atom path reports the default account (u/0) of the
// session, which is the account the service view is signed into.
const FEED_URL = "https://mail.google.com/mail/feed/atom";

// <fullcount>N</fullcount> — total unread conversations in the inbox
const FULLCOUNT_RE = /<fullcount>(\d+)<\/fullcount>/;

export const gmailAdapter: BadgeAdapter = {
  name: "Gmail",

  matches: (host) =>
    host === "mail.google.com" || host === "gmail.com" || host === "inbox.google.com",

  async fetchCount(session: Session): Promise<number | null> {
    try {
      const res = await session.fetch(FEED_URL, { cache: "no-store" });
      if (!res.ok) return null; // logged out → 401, or Google changed the endpoint
      const xml = await res.text();
      // A login redirect can still 200 with an HTML page — the regex only
      // matches the real feed, so that case falls through to null.
      const match = xml.match(FULLCOUNT_RE);
      return match ? parseInt(match[1], 10) : null;
    } catch {
      return null; // network error — let title/DOM extraction take over
    }
  },
};
