// Alphabetical ordering for the add-a-service preset grid (issue #100).
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
