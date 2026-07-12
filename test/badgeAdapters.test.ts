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

describe("gmailAdapter.fetchCount", () => {
  const sessionWith = (response: Partial<{ ok: boolean; body: string }>) =>
    ({
      fetch: async () => ({
        ok: response.ok ?? true,
        text: async () => response.body ?? "",
      }),
    }) as unknown as Session;

  it("parses the fullcount from the Atom feed", async () => {
    const session = sessionWith({
      body: '<?xml version="1.0"?><feed><fullcount>7</fullcount></feed>',
    });
    expect(await gmailAdapter.fetchCount!(session)).toBe(7);
  });

  it("returns null on non-OK responses (logged out)", async () => {
    expect(await gmailAdapter.fetchCount!(sessionWith({ ok: false }))).toBeNull();
  });

  it("returns null when the response is not the feed (login page HTML)", async () => {
    expect(await gmailAdapter.fetchCount!(sessionWith({ body: "<html>login</html>" }))).toBeNull();
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
