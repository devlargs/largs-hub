// Per-service zoom. Pure logic only — the caller owns the WebContentsView and
// the store; this module just decides what the next zoom factor should be.
//
// Chromium's own zoom ladder, so Ctrl+= / Ctrl+- land on the same factors a
// browser would rather than drifting by a raw multiplier.
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];

export const DEFAULT_ZOOM = 1;
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

// A stored factor is only trusted if it's a finite number inside the ladder's
// range — anything else (missing, NaN, hand-edited nonsense) falls back to 100%.
export function sanitizeZoom(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_ZOOM;
  if (raw < MIN_ZOOM || raw > MAX_ZOOM) return DEFAULT_ZOOM;
  return raw;
}

// The next step up or down the ladder. A factor between two steps snaps to the
// neighbouring one in the direction of travel; the ends clamp rather than wrap.
export function nextZoom(current: unknown, direction: "in" | "out"): number {
  const from = sanitizeZoom(current);
  if (direction === "in") {
    return ZOOM_STEPS.find((step) => step > from + 1e-6) ?? MAX_ZOOM;
  }
  const below = ZOOM_STEPS.filter((step) => step < from - 1e-6);
  return below.length > 0 ? below[below.length - 1] : MIN_ZOOM;
}
