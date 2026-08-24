import { BadgeAdapter } from "./types";

// Messenger's unread signals have churned over the years, so this probes in
// layers, most-specific first.
//
// Messenger only writes "(N)" into document.title for messages that have just
// *arrived*. A thread the user marks unread by hand never touches the title,
// which is why that case went undetected entirely (issue #57) — everything
// below title extraction exists to catch it.
//
// Fallback chain for this service:
//   title "(N)" → "N unread" on any chats/messages label → numeric badge on
//   the Chats rail → unread markers on rendered thread rows → legacy favicon
//   badge (as 1) → 0
export const messengerAdapter: BadgeAdapter = {
  name: "Messenger",

  matches: (host) =>
    host === "messenger.com" ||
    host.endsWith(".messenger.com") ||
    host === "facebook.com" ||
    host.endsWith(".facebook.com"),

  pollScript: `
    const UNREAD = /\\bunread\\b/i;
    // The guard that keeps this adapter honest on facebook.com: the
    // notification jewel is labelled "Notifications, 5 unread", which is not a
    // message count and must never reach the badge.
    const CHATS = /chats|messages|messenger/i;

    const labelled = document.querySelectorAll('[aria-label]');

    // 1. An explicit "N unread" on anything that names chats or messages.
    //    Matching on the label text rather than on a guessed element type
    //    ("a[aria-label]", 'div[role="link"]') is the part that matters — the
    //    old selector missed the rail whenever its markup changed shape.
    for (const el of labelled) {
      const label = el.getAttribute('aria-label') || '';
      if (!CHATS.test(label) || !UNREAD.test(label)) continue;
      const match = label.match(/(\\d+)\\s*unread/i) || label.match(/unread[^\\d]{0,12}(\\d+)/i);
      if (match) return parseInt(match[1] || match[2], 10);
    }

    // 2. The Chats rail's visual badge: a leaf span whose entire text is the
    //    number ("3", "99+"). Leaf-only so aggregated wrapper text can't
    //    false-positive.
    for (const el of labelled) {
      const label = el.getAttribute('aria-label') || '';
      if (!CHATS.test(label)) continue;
      for (const span of el.querySelectorAll('span')) {
        const text = (span.textContent || '').trim();
        if (span.children.length === 0 && /^\\d+\\+?$/.test(text)) {
          return parseInt(text, 10);
        }
      }
    }

    // 3. Unread markers on the rendered thread rows. Checks the row's own
    //    aria-label as well as its descendants — some builds put the state on
    //    the row link itself ("Ada, sent a photo, 2h ago, Unread").
    //
    //    Caveat: the thread list is virtualized, so this only ever sees rows
    //    that are currently rendered. It undercounts a long backlog scrolled
    //    out of view, which is why the rail layers above run first.
    let unread = 0;
    for (const row of document.querySelectorAll('[role="row"], [role="listitem"]')) {
      const rowLabel = (row.getAttribute && row.getAttribute('aria-label')) || '';
      if (UNREAD.test(rowLabel)) {
        unread++;
        continue;
      }
      if (row.querySelector && row.querySelector('[aria-label*="unread" i]')) {
        unread++;
      }
    }
    if (unread > 0) return unread;

    // 4. Legacy favicon badge — only signals presence, not a count
    const favicon = document.querySelector('link[rel*="icon"]');
    if (favicon && favicon.href && favicon.href.includes('badge')) return 1;
    return null;
  `,
};
