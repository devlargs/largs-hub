import { BadgeAdapter } from "./types";
import { gmailAdapter } from "./gmail";
import { whatsappAdapter } from "./whatsapp";
import { messengerAdapter } from "./messenger";

export type { BadgeAdapter } from "./types";

// Registry of service-specific unread-count adapters. To support a new
// service, add a module here — nothing in main.ts needs to change.
const adapters: BadgeAdapter[] = [gmailAdapter, whatsappAdapter, messengerAdapter];

// "(N)" anywhere in the tab title — the shared convention across Gmail,
// Messenger, Slack, and most web apps. Always tried before adapter logic.
const TITLE_COUNT_RE = /\((\d+)\)/;

export function parseTitleCount(title: string): number {
  const match = title.match(TITLE_COUNT_RE);
  return match ? parseInt(match[1], 10) : 0;
}

export function findBadgeAdapter(host: string): BadgeAdapter | undefined {
  return adapters.find((a) => a.matches(host));
}

// Builds the script the poller injects into a service page: title extraction
// first (most reliable), then the adapter's targeted selectors, defaulting to
// 0. Adapter fragments run in their own function scope and return null to
// fall through.
export function buildPollScript(adapter: BadgeAdapter | undefined): string {
  return `
    (() => {
      const titleMatch = document.title.match(/\\((\\d+)\\)/);
      if (titleMatch) return parseInt(titleMatch[1], 10);
      ${
        adapter?.pollScript
          ? `
      const adapterCount = (() => { ${adapter.pollScript} })();
      if (typeof adapterCount === "number" && adapterCount > 0) return adapterCount;
      `
          : ""
      }
      return 0;
    })()
  `;
}
