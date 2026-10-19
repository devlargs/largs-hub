import { BadgeAdapter } from "./types";

// WhatsApp Web usually mirrors the unread count into the tab title as "(N)",
// but drops it in some states, so the chat list is scraped as a fallback:
// each unread chat renders a badge <span> whose aria-label contains
// "N unread message(s)". Badges that expose no parseable number (e.g. the
// "999+" overflow style) count as 1. The "Archived" entry at the top of the
// chat list carries the same kind of badge for archived chats, which the user
// has deliberately put away, so badges inside that entry are skipped.
// Fallback chain for this service: title "(N)" → aria-label badges → 0.
export const whatsappAdapter: BadgeAdapter = {
  name: "WhatsApp",

  matches: (host) => host === "whatsapp.com" || host.endsWith(".whatsapp.com"),

  // The *= substring match on "unread message" also covers the plural label.
  // The archived entry is recognised by its archive icon, its aria-label, or
  // a label that starts with "Archived".
  pollScript: `
    const unreadBadges = document.querySelectorAll('span[aria-label*="unread message"]');
    if (unreadBadges.length === 0) return null;
    const isArchivedEntry = (el) => {
      const row = el.closest ? el.closest('[role="listitem"], [role="row"], [role="button"], button') : null;
      if (!row) return false;
      if (row.querySelector('[data-icon*="archive"]')) return true;
      if (/archived/i.test(row.getAttribute("aria-label") || "")) return true;
      // No word boundary: the count follows straight on ("Archived5")
      return /^\\s*archived/i.test(row.textContent || "");
    };
    let total = 0;
    unreadBadges.forEach((el) => {
      if (isArchivedEntry(el)) return;
      const num = parseInt(el.textContent || "0", 10);
      total += num > 0 ? num : 1;
    });
    return total > 0 ? total : null;
  `,
};
