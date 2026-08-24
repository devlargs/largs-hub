// The emojis most recently used to start an emoji burst, newest first.
//
// Pure module so it can be unit-tested without an Electron runtime; the store
// read/write lives in messengerAutomation.ts.

export const MAX_RECENT_EMOJIS = 16;
// Same ceiling validateSpec applies to the emoji field.
const MAX_EMOJI_LENGTH = 100;

export function sanitizeRecentEmojis(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const emojis: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const emoji = entry.trim();
    if (emoji.length === 0 || emoji.length > MAX_EMOJI_LENGTH) continue;
    if (seen.has(emoji)) continue;
    seen.add(emoji);
    emojis.push(emoji);
    if (emojis.length >= MAX_RECENT_EMOJIS) break;
  }
  return emojis;
}

// Move an emoji to the front, dropping any earlier copy so re-using one
// reorders the pane instead of filling it with duplicates.
export function addRecentEmoji(list: unknown, emoji: unknown): string[] {
  const current = sanitizeRecentEmojis(list);
  if (typeof emoji !== "string") return current;
  const trimmed = emoji.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMOJI_LENGTH) return current;
  return [trimmed, ...current.filter((e) => e !== trimmed)].slice(0, MAX_RECENT_EMOJIS);
}
