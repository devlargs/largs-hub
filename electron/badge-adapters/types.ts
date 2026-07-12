import type { Session } from "electron";

// A badge adapter encapsulates the service-specific parts of unread-count
// extraction (issue #46). Title parsing — the "(N)" pattern shared by Gmail,
// Messenger, Slack, and most web apps — is NOT an adapter concern; it always
// runs first (see buildPollScript in index.ts and the page-title-updated
// listener in main.ts). Adapters only add what the title can't provide.
export interface BadgeAdapter {
  /** Human-readable name, for documentation/debugging. */
  readonly name: string;

  /** Whether this adapter handles the given service hostname (no "www."). */
  matches(host: string): boolean;

  /**
   * Optional JavaScript fragment injected into the page by the poller when the
   * title carries no "(N)" count. Runs inside its own function scope: it must
   * `return` a positive number when it finds a count, or `null` to fall
   * through to the default of 0. Keep selectors narrowly targeted — broad
   * heuristics cause false-positive badges.
   */
  readonly pollScript?: string;

  /**
   * Optional main-process count source that bypasses DOM scraping entirely
   * (e.g. Gmail's Atom feed, fetched with the service session's cookies).
   * Resolve a number when the count is known, or null when it can't be
   * determined (logged out, endpoint changed, network error) so callers fall
   * back to title/DOM extraction. Must never reject.
   */
  fetchCount?(session: Session): Promise<number | null>;
}
