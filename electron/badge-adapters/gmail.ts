import type { Session } from "electron";
import { BadgeAdapter } from "./types";

// Gmail's Atom feed reports unread counts server-side, so it stays correct
// when the tab-title "(N)" is wrong or missing — the title only counts the
// focused inbox tab and disappears entirely with some display/tab settings
// (issue #26). The feed is cookie-authenticated: fetching it through the
// service's session reuses the existing login, no extra credentials needed.
// Note: the /mail/feed/atom paths report the default account (u/0) of the
// session, which is the account the service view is signed into.
//
// The bare inbox feed counts EVERYTHING in the inbox — for tabbed inboxes
// that includes Promotions/Social, which is not what users think of as
// "unread mail" (it's how the badge ends up at 99+). "^sq_ig_i_personal" is
// Gmail's internal label for the Primary category, so that feed is queried
// first; the whole-inbox feed is only a fallback for accounts where the
// category feed yields nothing (e.g. the label is unavailable).
const FEED_URLS = [
  "https://mail.google.com/mail/feed/atom/%5Esq_ig_i_personal", // Primary tab only
  "https://mail.google.com/mail/feed/atom", // whole inbox
];

// <fullcount>N</fullcount> — total unread conversations in the queried label
const FULLCOUNT_RE = /<fullcount>(\d+)<\/fullcount>/;

export const gmailAdapter: BadgeAdapter = {
  name: "Gmail",

  matches: (host) =>
    host === "mail.google.com" || host === "gmail.com" || host === "inbox.google.com",

  async fetchCount(session: Session): Promise<number | null> {
    for (const url of FEED_URLS) {
      try {
        const res = await session.fetch(url, { cache: "no-store" });
        if (!res.ok) continue; // logged out → 401, or this feed variant is gone
        const xml = await res.text();
        // A login redirect can still 200 with an HTML page — the regex only
        // matches the real feed, so that case falls through.
        const match = xml.match(FULLCOUNT_RE);
        if (match) return parseInt(match[1], 10);
      } catch {
        return null; // network error — let title/DOM extraction take over
      }
    }
    return null;
  },
};
