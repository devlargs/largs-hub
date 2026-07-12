import { BadgeAdapter } from "./types";

// WhatsApp Web usually mirrors the unread count into the tab title as "(N)",
// but drops it in some states, so the chat list is scraped as a fallback:
// each unread chat renders a badge <span> whose aria-label contains
// "N unread message(s)". Badges that expose no parseable number (e.g. the
// "999+" overflow style) count as 1.
// Fallback chain for this service: title "(N)" → aria-label badges → 0.
export const whatsappAdapter: BadgeAdapter = {
  name: "WhatsApp",

  matches: (host) => host === "whatsapp.com" || host.endsWith(".whatsapp.com"),

  // The *= substring match on "unread message" also covers the plural label.
  pollScript: `
    const unreadBadges = document.querySelectorAll('span[aria-label*="unread message"]');
    if (unreadBadges.length === 0) return null;
    let total = 0;
    unreadBadges.forEach((el) => {
      const num = parseInt(el.textContent || "0", 10);
      total += num > 0 ? num : 1;
    });
    return total > 0 ? total : null;
  `,
};
