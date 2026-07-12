import { BadgeAdapter } from "./types";

// Messenger's unread signals have churned over the years, so this probes in
// layers, most-specific first. The exact count still comes from the title
// "(N)" when Messenger provides it (title extraction always runs before
// adapter scripts).
// Fallback chain for this service:
//   title "(N)" → Chats nav aria-label ("… N unread") → numeric badge text on
//   the Chats nav item → legacy favicon badge (as 1) → 0
export const messengerAdapter: BadgeAdapter = {
  name: "Messenger",

  matches: (host) =>
    host === "messenger.com" ||
    host.endsWith(".messenger.com") ||
    host === "facebook.com" ||
    host.endsWith(".facebook.com"),

  pollScript: `
    // 1. The Chats item in the left rail. Its aria-label localizes the unread
    //    count (e.g. "Chats, 3 unread"), and its visual badge is a small span
    //    whose entire text is the number.
    const navLinks = document.querySelectorAll('a[aria-label], div[aria-label][role="link"]');
    for (const link of navLinks) {
      const label = link.getAttribute('aria-label') || '';
      if (!/chats|messenger|messages/i.test(label)) continue;
      const labelMatch = label.match(/(\\d+)\\s*unread/i);
      if (labelMatch) return parseInt(labelMatch[1], 10);
      // Badge = a leaf span whose entire text is the number ("3", "99+");
      // leaf-only so aggregated wrapper text can't false-positive.
      for (const span of link.querySelectorAll('span')) {
        const text = (span.textContent || '').trim();
        if (span.children.length === 0 && /^\\d+\\+?$/.test(text)) {
          return parseInt(text, 10);
        }
      }
    }

    // 2. Unread markers in the thread list ("unread" in row aria-labels)
    const unreadRows = document.querySelectorAll('[role="row"] [aria-label*="unread" i]');
    if (unreadRows.length > 0) return unreadRows.length;

    // 3. Legacy favicon badge — only signals presence, not a count
    const favicon = document.querySelector('link[rel*="icon"]');
    if (favicon && favicon.href && favicon.href.includes('badge')) return 1;
    return null;
  `,
};
