import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  centeredOffset,
  clampOffset,
  coverScale,
  cropRect,
  outputSize,
  zoomOffset,
} from "../src/lib/cropGeometry";

const FRAME = 260;
const WIDE = { width: 800, height: 400 };
const TALL = { width: 400, height: 800 };
const SQUARE = { width: 500, height: 500 };

describe("coverScale", () => {
  it("scales a wide image to its shorter side", () => {
    // 260 / 400, not 260 / 800 — the height is what has to reach the frame.
    expect(coverScale(WIDE, FRAME)).toBeCloseTo(FRAME / 400);
    expect(coverScale(TALL, FRAME)).toBeCloseTo(FRAME / 400);
  });

  it("upscales an image smaller than the frame so it still covers", () => {
    expect(coverScale({ width: 64, height: 64 }, FRAME)).toBeCloseTo(FRAME / 64);
  });

  it("refuses to divide by a zero dimension", () => {
    expect(coverScale({ width: 0, height: 0 }, FRAME)).toBe(1);
  });
});

describe("clampOffset", () => {
  const scale = coverScale(WIDE, FRAME);

  it("never lets the image pull away from the top-left", () => {
    expect(clampOffset({ x: 50, y: 30 }, WIDE, scale, FRAME)).toEqual({ x: 0, y: 0 });
  });

  it("never lets the image pull away from the bottom-right", () => {
    const dragged = clampOffset({ x: -99999, y: -99999 }, WIDE, scale, FRAME);
    expect(dragged.x).toBeCloseTo(FRAME - WIDE.width * scale);
    // The height covers exactly, so there is no vertical travel at all.
    expect(dragged.y).toBeCloseTo(0);
  });

  it("leaves an offset inside the bounds alone", () => {
    expect(clampOffset({ x: -100, y: 0 }, WIDE, scale, FRAME)).toEqual({ x: -100, y: 0 });
  });
});

describe("centeredOffset", () => {
  it("centres the overhang of a wide image", () => {
    const scale = coverScale(WIDE, FRAME);
    const offset = centeredOffset(WIDE, scale, FRAME);
    expect(offset.x).toBeCloseTo((FRAME - WIDE.width * scale) / 2);
    expect(offset.y).toBeCloseTo(0);
  });

  it("sits flush for a square image", () => {
    const scale = coverScale(SQUARE, FRAME);
    expect(centeredOffset(SQUARE, scale, FRAME)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoomOffset", () => {
  it("keeps whatever is under the middle of the frame in the middle", () => {
    const from = coverScale(SQUARE, FRAME);
    const to = from * 2;
    const start = centeredOffset(SQUARE, from, FRAME);
    const zoomed = zoomOffset(start, SQUARE, FRAME, from, to);
    const middleBefore = (FRAME / 2 - start.x) / from;
    const middleAfter = (FRAME / 2 - zoomed.x) / to;
    expect(middleAfter).toBeCloseTo(middleBefore);
  });

  it("clamps back inside the frame when zooming out to the cover scale", () => {
    const cover = coverScale(SQUARE, FRAME);
    const zoomedIn = zoomOffset(
      centeredOffset(SQUARE, cover, FRAME),
      SQUARE,
      FRAME,
      cover,
      cover * MAX_ZOOM,
    );
    const backOut = zoomOffset(zoomedIn, SQUARE, FRAME, cover * MAX_ZOOM, cover);
    expect(backOut).toEqual({ x: 0, y: 0 });
  });
});

describe("cropRect", () => {
  it("takes the whole of a square image at the cover scale", () => {
    const scale = coverScale(SQUARE, FRAME);
    expect(cropRect({ x: 0, y: 0 }, SQUARE, scale, FRAME)).toEqual({
      sx: 0,
      sy: 0,
      size: 500,
    });
  });

  it("takes a centred square out of a wide image", () => {
    const scale = coverScale(WIDE, FRAME);
    const crop = cropRect(centeredOffset(WIDE, scale, FRAME), WIDE, scale, FRAME);
    expect(crop.size).toBeCloseTo(400);
    expect(crop.sx).toBeCloseTo(200);
    expect(crop.sy).toBeCloseTo(0);
  });

  it("halves the cut when zoomed to 2x", () => {
    const scale = coverScale(SQUARE, FRAME) * 2;
    expect(cropRect({ x: 0, y: 0 }, SQUARE, scale, FRAME).size).toBeCloseTo(250);
  });

  it("never samples past the edge of the image", () => {
    const scale = coverScale(WIDE, FRAME);
    const crop = cropRect({ x: -100000, y: -100000 }, WIDE, scale, FRAME);
    expect(crop.sx).toBeLessThanOrEqual(WIDE.width - crop.size);
    expect(crop.sy).toBeLessThanOrEqual(WIDE.height - crop.size);
    expect(crop.sx).toBeGreaterThanOrEqual(0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
  });
});

describe("outputSize", () => {
  it("caps a big crop rather than writing a huge icon", () => {
    expect(outputSize({ sx: 0, sy: 0, size: 2000 })).toBe(256);
  });

  it("never upscales a small crop", () => {
    expect(outputSize({ sx: 0, sy: 0, size: 40 })).toBe(40);
  });

  it("is always at least one pixel", () => {
    expect(outputSize({ sx: 0, sy: 0, size: 0 })).toBe(1);
  });
});
