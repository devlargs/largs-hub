// Geometry for the square icon cropper (issue #101).
//
// The crop frame is a fixed square; the image sits behind it, scaled and
// offset. Everything here works in two coordinate spaces: frame pixels (what is
// drawn) and image pixels (what is cut out at the end). Pure so it can be
// unit-tested — the component only turns these numbers into styles and a canvas
// call.

export interface Size {
  width: number;
  height: number;
}

/** Position of the image's top-left corner, in frame pixels. Usually negative. */
export interface Offset {
  x: number;
  y: number;
}

/** How far in the user may zoom, as a multiple of the scale that just covers the frame. */
export const MAX_ZOOM = 4;

/** The smallest scale that still covers the frame — no empty corners at any offset. */
export function coverScale(image: Size, frame: number): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(frame / image.width, frame / image.height);
}

/** Keeps the image covering the frame, so a drag can never expose the backdrop. */
export function clampOffset(offset: Offset, image: Size, scale: number, frame: number): Offset {
  const clampAxis = (value: number, extent: number) => {
    // A displayed edge shorter than the frame (possible only with rounding)
    // has nowhere to travel; pin it rather than inverting the bounds.
    const min = Math.min(0, frame - extent);
    return Math.min(0, Math.max(min, value));
  };
  return {
    x: clampAxis(offset.x, image.width * scale),
    y: clampAxis(offset.y, image.height * scale),
  };
}

/** The image centred in the frame — where the cropper opens. */
export function centeredOffset(image: Size, scale: number, frame: number): Offset {
  return clampOffset(
    {
      x: (frame - image.width * scale) / 2,
      y: (frame - image.height * scale) / 2,
    },
    image,
    scale,
    frame,
  );
}

/**
 * Re-anchors the offset for a new scale so whatever was under the middle of the
 * frame stays there — zooming otherwise walks the subject off to one side.
 */
export function zoomOffset(
  offset: Offset,
  image: Size,
  frame: number,
  fromScale: number,
  toScale: number,
): Offset {
  const middle = frame / 2;
  const anchor = {
    x: (middle - offset.x) / fromScale,
    y: (middle - offset.y) / fromScale,
  };
  return clampOffset(
    { x: middle - anchor.x * toScale, y: middle - anchor.y * toScale },
    image,
    toScale,
    frame,
  );
}

export interface CropRect {
  /** Source rectangle in image pixels, always square. */
  sx: number;
  sy: number;
  size: number;
}

/** The square of the original image the frame is showing. */
export function cropRect(offset: Offset, image: Size, scale: number, frame: number): CropRect {
  const size = Math.min(frame / scale, image.width, image.height);
  // Rounding can push the rect a fraction past the edge; drawImage would then
  // sample outside the bitmap and return transparent pixels.
  const sx = Math.min(Math.max(0, -offset.x / scale), image.width - size);
  const sy = Math.min(Math.max(0, -offset.y / scale), image.height - size);
  return { sx, sy, size };
}

/**
 * Side of the exported PNG. The crop is never upscaled — a 40px source stays
 * 40px — and never exceeds the cap, which is already generous for a 72px tile.
 */
export function outputSize(crop: CropRect, cap = 256): number {
  return Math.max(1, Math.min(cap, Math.round(crop.size)));
}
