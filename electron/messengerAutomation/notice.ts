import type { NoticeReason } from "../shared/types";

// --- "She noticed you" detection (call cycle) ---------------------------------
// The cycle exists to get someone's attention, so any sign it worked should end
// it — not just a picked-up call. These signals are read out of the open
// Messenger conversation (NOTICE_SCRIPT) and compared against a baseline taken
// when the cycle starts.

export interface NoticeSignals {
  // Message rows in the open thread, excluding call system rows ("You called…")
  // which the cycle itself creates.
  count: number;
  // Text of the last such row — catches a reply that lands while the list is
  // virtualized and the row count happens not to move.
  last: string;
  // A "Seen" read receipt is showing in the thread.
  seen: boolean;
  // The other person is typing.
  typing: boolean;
}

export function isNoticeSignals(value: unknown): value is NoticeSignals {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<NoticeSignals>;
  return (
    typeof v.count === "number" &&
    typeof v.last === "string" &&
    typeof v.seen === "boolean" &&
    typeof v.typing === "boolean"
  );
}

// Returns a short reason string when `now` shows a reaction that `base` didn't,
// or null while nothing has changed. Only transitions count, so a thread that
// was already "Seen" before the cycle started doesn't cancel it immediately.
export function detectNotice(base: NoticeSignals, now: NoticeSignals): NoticeReason | null {
  if (now.typing && !base.typing) return "typing";
  if (now.seen && !base.seen) return "seen";
  if (now.count > base.count) return "replied";
  if (now.last && base.last && now.last !== base.last) return "replied";
  return null;
}
