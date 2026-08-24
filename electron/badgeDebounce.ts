// Decrease debounce for notification badges.
//
// Pages briefly report 0 during a navigation or a mid-poll re-render, which
// made badges blink to zero and back (issues #19/#21/#28). Increases are always
// trusted immediately — a new message should show at once — but a *decrease*
// has to be seen at the same value several polls running before it's accepted.
//
// Pure state machine over a map, extracted from notificationCounts.ts so it can
// be unit-tested without an Electron runtime (issue #87).

/** Consecutive identical lower readings needed before a decrease is accepted. */
export const DECREASE_THRESHOLD = 2;

export interface PendingDecrease {
  count: number;
  streak: number;
}

export type DebounceDecision =
  /** Take the new count and propagate it. */
  | { accept: true }
  /** Hold the current count; the reading was a suspected blip. */
  | { accept: false };

/**
 * Decide whether a reported count should be applied.
 *
 * `pending` is the caller's per-service debounce map; this function mutates the
 * entry for `serviceId` the way the real one does, so the caller only has to
 * act on the decision.
 */
export function shouldAcceptCount(
  pending: Map<string, PendingDecrease>,
  serviceId: string,
  previous: number,
  next: number,
  threshold: number = DECREASE_THRESHOLD,
): DebounceDecision {
  // Unchanged: nothing to do, and any in-flight decrease is stale.
  if (next === previous) {
    pending.delete(serviceId);
    return { accept: false };
  }

  // An increase is always trusted, and clears a pending decrease.
  if (next > previous) {
    pending.delete(serviceId);
    return { accept: true };
  }

  const inFlight = pending.get(serviceId);
  if (inFlight && inFlight.count === next) {
    inFlight.streak++;
    if (inFlight.streak < threshold) return { accept: false };
    pending.delete(serviceId);
    return { accept: true };
  }

  // First sighting of this lower value (or the value moved) — start again.
  pending.set(serviceId, { count: next, streak: 1 });
  return { accept: false };
}
