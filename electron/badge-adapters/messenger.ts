import { BadgeAdapter } from "./types";

// Messenger swaps its favicon to a "badge" variant when there are unread
// conversations. That only signals *presence* of unreads, not how many, so it
// reports 1 — the exact count still comes from the title "(N)" when Messenger
// provides it (title extraction always runs before adapter scripts).
// Fallback chain for this service: title "(N)" → favicon badge (as 1) → 0.
export const messengerAdapter: BadgeAdapter = {
  name: "Messenger",

  matches: (host) =>
    host === "messenger.com" ||
    host.endsWith(".messenger.com") ||
    host === "facebook.com" ||
    host.endsWith(".facebook.com"),

  pollScript: `
    const favicon = document.querySelector('link[rel*="icon"]');
    if (favicon && favicon.href && favicon.href.includes('badge')) return 1;
    return null;
  `,
};
