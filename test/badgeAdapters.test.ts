import { describe, expect, it } from "vitest";
import { buildPollScript, findBadgeAdapter, parseTitleCount } from "../electron/badge-adapters";
import { gmailAdapter } from "../electron/badge-adapters/gmail";
import type { Session } from "electron";

describe("parseTitleCount", () => {
  it("reads the (N) convention from tab titles", () => {
    expect(parseTitleCount("(3) Inbox - Gmail")).toBe(3);
    expect(parseTitleCount("Slack (12)")).toBe(12);
  });

  it("returns 0 when the title carries no count", () => {
    expect(parseTitleCount("Inbox - Gmail")).toBe(0);
    expect(parseTitleCount("")).toBe(0);
  });
});

describe("findBadgeAdapter", () => {
  it("matches known service hosts", () => {
    expect(findBadgeAdapter("mail.google.com")?.name).toBe("Gmail");
    expect(findBadgeAdapter("web.whatsapp.com")?.name).toBe("WhatsApp");
    expect(findBadgeAdapter("messenger.com")?.name).toBe("Messenger");
    expect(findBadgeAdapter("facebook.com")?.name).toBe("Messenger");
  });

  it("does not match lookalike domains", () => {
    expect(findBadgeAdapter("notmessenger.com")).toBeUndefined();
    expect(findBadgeAdapter("mail.google.com.evil.example")).toBeUndefined();
    expect(findBadgeAdapter("example.com")).toBeUndefined();
  });
});

describe("buildPollScript", () => {
  it("always includes title extraction", () => {
    const script = buildPollScript(undefined);
    expect(script).toContain("document.title.match");
  });

  it("embeds the adapter's selectors when present", () => {
    const script = buildPollScript(findBadgeAdapter("web.whatsapp.com"));
    expect(script).toContain("unread message");
  });
});

// Execute the generated poll scripts against a stubbed DOM — proves the
// injected JS is syntactically valid and each fallback layer behaves.
function runPollScript(script: string, doc: Record<string, unknown>): unknown {
  return new Function("document", `return (${script})`)(doc);
}

interface FakeElement {
  ariaLabel?: string;
  spans?: { text: string; hasChildren?: boolean }[];
  text?: string;
  href?: string;
}

function fakeDocument(opts: {
  title?: string;
  navLinks?: FakeElement[];
  unreadRows?: number;
  faviconHref?: string;
  whatsappBadges?: string[];
}) {
  const toNavLink = (el: FakeElement) => ({
    getAttribute: () => el.ariaLabel ?? "",
    querySelectorAll: () =>
      (el.spans ?? []).map((s) => ({
        textContent: s.text,
        children: { length: s.hasChildren ? 1 : 0 },
      })),
  });
  return {
    title: opts.title ?? "Messenger",
    querySelector: (selector: string) =>
      selector.includes("icon") && opts.faviconHref ? { href: opts.faviconHref } : null,
    querySelectorAll: (selector: string) => {
      if (selector.includes("aria-label*=\"unread message\"")) {
        return (opts.whatsappBadges ?? []).map((text) => ({ textContent: text }));
      }
      if (selector.includes("role=\"row\"")) {
        return new Array(opts.unreadRows ?? 0).fill({});
      }
      if (selector.includes("aria-label")) {
        return (opts.navLinks ?? []).map(toNavLink);
      }
      return [];
    },
  };
}

describe("messenger poll script (executed)", () => {
  const script = buildPollScript(findBadgeAdapter("messenger.com"));

  it("prefers the title count", () => {
    expect(runPollScript(script, fakeDocument({ title: "(4) Messenger" }))).toBe(4);
  });

  it("reads the unread count from the Chats nav aria-label", () => {
    const doc = fakeDocument({ navLinks: [{ ariaLabel: "Chats, 3 unread" }] });
    expect(runPollScript(script, doc)).toBe(3);
  });

  it("reads a numeric leaf badge span on the Chats nav item", () => {
    const doc = fakeDocument({
      navLinks: [{ ariaLabel: "Chats", spans: [{ text: "Chats3", hasChildren: true }, { text: "5" }] }],
    });
    expect(runPollScript(script, doc)).toBe(5);
  });

  it("ignores nav items unrelated to chats", () => {
    const doc = fakeDocument({ navLinks: [{ ariaLabel: "Marketplace", spans: [{ text: "8" }] }] });
    expect(runPollScript(script, doc)).toBe(0);
  });

  it("counts unread thread-list markers", () => {
    expect(runPollScript(script, fakeDocument({ unreadRows: 2 }))).toBe(2);
  });

  it("falls back to the legacy favicon badge as 1", () => {
    const doc = fakeDocument({ faviconHref: "https://static.xx.fbcdn.net/badge.ico" });
    expect(runPollScript(script, doc)).toBe(1);
  });

  it("reports 0 when nothing indicates unreads", () => {
    expect(runPollScript(script, fakeDocument({}))).toBe(0);
  });
});

describe("whatsapp poll script (executed)", () => {
  const script = buildPollScript(findBadgeAdapter("web.whatsapp.com"));

  it("sums numeric badges and counts blank badges as 1", () => {
    const doc = fakeDocument({ whatsappBadges: ["3", "2", ""] });
    expect(runPollScript(script, doc)).toBe(6);
  });

  it("prefers the title count", () => {
    expect(runPollScript(script, fakeDocument({ title: "(9) WhatsApp" }))).toBe(9);
  });
});

describe("gmailAdapter.fetchCount", () => {
  const feed = (count: number) =>
    `<?xml version="1.0"?><feed><fullcount>${count}</fullcount></feed>`;

  // URL-aware fake session: responses keyed by URL substring, and every
  // requested URL is recorded so tests can assert the query order.
  const sessionWith = (
    respond: (url: string) => Partial<{ ok: boolean; body: string }>,
    requested: string[] = [],
  ) =>
    ({
      fetch: async (url: string) => {
        requested.push(url);
        const response = respond(url);
        return {
          ok: response.ok ?? true,
          text: async () => response.body ?? "",
        };
      },
    }) as unknown as Session;

  it("uses the Primary-category feed, not the whole-inbox count", async () => {
    const requested: string[] = [];
    // Primary tab has 2 unread; the whole inbox (incl. Promotions) has 250
    const session = sessionWith(
      (url) => ({ body: url.includes("sq_ig_i_personal") ? feed(2) : feed(250) }),
      requested,
    );
    expect(await gmailAdapter.fetchCount!(session)).toBe(2);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain("%5Esq_ig_i_personal");
  });

  it("falls back to the whole-inbox feed when the category feed yields nothing", async () => {
    const session = sessionWith((url) =>
      url.includes("sq_ig_i_personal") ? { ok: false } : { body: feed(7) },
    );
    expect(await gmailAdapter.fetchCount!(session)).toBe(7);
  });

  it("returns null when every feed responds non-OK (logged out)", async () => {
    expect(await gmailAdapter.fetchCount!(sessionWith(() => ({ ok: false })))).toBeNull();
  });

  it("returns null when the response is not the feed (login page HTML)", async () => {
    expect(
      await gmailAdapter.fetchCount!(sessionWith(() => ({ body: "<html>login</html>" }))),
    ).toBeNull();
  });

  it("returns null when the fetch itself fails", async () => {
    const session = {
      fetch: async () => {
        throw new Error("offline");
      },
    } as unknown as Session;
    expect(await gmailAdapter.fetchCount!(session)).toBeNull();
  });
});
