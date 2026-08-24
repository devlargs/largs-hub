import { describe, expect, it } from "vitest";
import { DEFAULT_ZOOM, ZOOM_STEPS, nextZoom, sanitizeZoom } from "../electron/zoom";

describe("sanitizeZoom", () => {
  it("keeps a factor inside the ladder's range", () => {
    expect(sanitizeZoom(1.25)).toBe(1.25);
    expect(sanitizeZoom(0.5)).toBe(0.5);
    expect(sanitizeZoom(2.5)).toBe(2.5);
  });

  it("falls back to 100% for anything out of range or not a number", () => {
    expect(sanitizeZoom(0.1)).toBe(DEFAULT_ZOOM);
    expect(sanitizeZoom(9)).toBe(DEFAULT_ZOOM);
    expect(sanitizeZoom(NaN)).toBe(DEFAULT_ZOOM);
    expect(sanitizeZoom(Infinity)).toBe(DEFAULT_ZOOM);
    expect(sanitizeZoom("1.5")).toBe(DEFAULT_ZOOM);
    expect(sanitizeZoom(undefined)).toBe(DEFAULT_ZOOM);
  });
});

describe("nextZoom", () => {
  it("steps up and down the ladder", () => {
    expect(nextZoom(1, "in")).toBe(1.1);
    expect(nextZoom(1, "out")).toBe(0.9);
    expect(nextZoom(1.25, "in")).toBe(1.5);
    expect(nextZoom(1.25, "out")).toBe(1.1);
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(nextZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], "in")).toBe(2.5);
    expect(nextZoom(ZOOM_STEPS[0], "out")).toBe(0.5);
  });

  it("snaps a factor between two steps to the neighbour it is heading for", () => {
    expect(nextZoom(1.2, "in")).toBe(1.25);
    expect(nextZoom(1.2, "out")).toBe(1.1);
  });

  it("treats an unusable stored factor as 100%", () => {
    expect(nextZoom(undefined, "in")).toBe(1.1);
    expect(nextZoom(42, "out")).toBe(0.9);
  });

  it("walks the whole ladder without stalling", () => {
    let factor = ZOOM_STEPS[0];
    const seen = [factor];
    for (let i = 0; i < ZOOM_STEPS.length - 1; i++) {
      factor = nextZoom(factor, "in");
      seen.push(factor);
    }
    expect(seen).toEqual(ZOOM_STEPS);
  });
});
