// Alphabetical ordering for the add-a-service preset grid (issue #100), and
// moving a service within the sidebar.
//
// Sorting in code rather than hand-ordering the list means a preset added later
// can't land out of place. Pure so it can be unit-tested.

/**
 * Case- and accent-insensitive name comparison, with the numeric option so a
 * hypothetical "Service 2" sorts before "Service 10".
 */
export function compareServiceNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/** A copy of the list ordered by name; the input is left alone. */
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareServiceNames(a.name, b.name));
}

// --- Reordering the sidebar -------------------------------------------------

/**
 * `ids` with `movedId` taken out and put where `targetId` was: dropping a
 * dragged service onto another. Null when nothing would change.
 */
export function moveOnto(
  ids: readonly string[],
  movedId: string,
  targetId: string,
): string[] | null {
  if (movedId === targetId) return null;
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return null;
  const reordered = [...ids];
  reordered.splice(from, 1);
  reordered.splice(to, 0, movedId);
  return reordered;
}

/**
 * `ids` with `movedId` one place up (-1) or down (1): Alt+Up/Down on a focused
 * service. Null at either end, or for an unknown id.
 */
export function moveBy(
  ids: readonly string[],
  movedId: string,
  direction: -1 | 1,
): string[] | null {
  const from = ids.indexOf(movedId);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return null;
  const reordered = [...ids];
  reordered.splice(from, 1);
  reordered.splice(to, 0, movedId);
  return reordered;
}

/**
 * The full service order after the sidebar reordered only what it shows:
 * `visibleOrder` fills the slots the shown services held in `allIds`, and the
 * hidden ones keep theirs. Every id in `allIds` stays — main's reorder drops
 * any id it isn't given, so sending the sidebar's ids alone would delete the
 * hidden services.
 */
export function withVisibleOrder(
  allIds: readonly string[],
  visibleOrder: readonly string[],
): string[] {
  const visible = new Set(visibleOrder);
  const next = visibleOrder.filter((id) => allIds.includes(id));
  let i = 0;
  return allIds.map((id) => (visible.has(id) ? (next[i++] ?? id) : id));
}
