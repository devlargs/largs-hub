// Saved message lists ("list groups") and the rule for picking the next entry.
//
// Pure module on purpose: store.ts and messengerAutomation.ts both need these,
// and neither can be imported in a unit test without an Electron runtime (see
// the testing note in CLAUDE.md).

export interface MessageListGroup {
  id: string;
  name: string;
  messages: string[];
  createdAt: number;
  updatedAt: number;
}

// Shared with messengerAutomation.ts, which validates single messages against
// the same ceiling.
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_GROUP_NAME_LENGTH = 80;
export const MAX_GROUP_MESSAGES = 200;

export type ListGroupResult =
  | { ok: true; group: MessageListGroup }
  | { ok: false; error: string };

// Unlike sanitizeService (which returns null), this reports *why* a group was
// rejected — the panel shows the reason next to the editor.
export function sanitizeMessageListGroup(raw: unknown, now = 0): ListGroupResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Invalid list group" };
  const g = raw as Record<string, unknown>;

  if (typeof g.id !== "string" || g.id.trim().length === 0) {
    return { ok: false, error: "Invalid list group" };
  }
  if (typeof g.name !== "string" || g.name.trim().length === 0) {
    return { ok: false, error: "Name is required" };
  }
  const name = g.name.trim();
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, error: `Name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer` };
  }

  if (!Array.isArray(g.messages)) return { ok: false, error: "Messages are required" };
  if (g.messages.length === 0) return { ok: false, error: "Add at least one message" };
  if (g.messages.length > MAX_GROUP_MESSAGES) {
    return { ok: false, error: `A list can hold at most ${MAX_GROUP_MESSAGES} messages` };
  }
  const messages: string[] = [];
  for (const entry of g.messages) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      return { ok: false, error: "Messages cannot be blank" };
    }
    if (entry.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: `A message must be ${MAX_MESSAGE_LENGTH} characters or fewer` };
    }
    messages.push(entry);
  }

  const createdAt = typeof g.createdAt === "number" && Number.isFinite(g.createdAt) ? g.createdAt : now;
  const updatedAt = typeof g.updatedAt === "number" && Number.isFinite(g.updatedAt) ? g.updatedAt : now;

  return { ok: true, group: { id: g.id, name, messages, createdAt, updatedAt } };
}

// Drop anything unreadable from the stored array rather than failing the whole
// read — one corrupted group shouldn't hide the rest.
export function sanitizeStoredGroups(raw: unknown): MessageListGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: MessageListGroup[] = [];
  for (const entry of raw) {
    const result = sanitizeMessageListGroup(entry);
    if (result.ok) groups.push(result.group);
  }
  return groups;
}

// Pick rule: uniform random, but never the same entry twice in a row.
//
// The issue left this open between uniform, no-immediate-repeat and a shuffled
// cycle. No-immediate-repeat is the one that reads as "random" to a person
// watching the thread — plain uniform visibly doubles messages up, and a
// shuffled cycle is predictable once you've seen the list. A single-entry list
// necessarily repeats.
export function pickNextIndex(
  count: number,
  lastIndex: number | null,
  random: () => number = Math.random,
): number {
  if (count <= 1) return 0;
  const roll = (n: number) => Math.min(n - 1, Math.max(0, Math.floor(random() * n)));
  if (lastIndex === null || lastIndex < 0 || lastIndex >= count) return roll(count);
  // Draw from the count-1 entries that aren't lastIndex, then shift past it —
  // uniform over every other entry, no rejection loop.
  const drawn = roll(count - 1);
  return drawn >= lastIndex ? drawn + 1 : drawn;
}
