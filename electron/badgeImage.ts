import { deflateSync } from "zlib";

// Taskbar badge rendering (issue #58).
//
// The badge used to be built as an SVG data URL and handed to
// nativeImage.createFromDataURL(). Electron's nativeImage only decodes PNG and
// JPEG, so that produced an empty image and setOverlayIcon() silently did
// nothing. There is no canvas in the main process, so the badge is drawn here
// by hand — a coverage-sampled circle and bitmap digits — and encoded as a
// real PNG that nativeImage can actually decode.
//
// Kept free of Electron imports so it can be unit-tested (test/badgeImage.test.ts).

// Badge fill (#ef4444) and the digits on top of it.
const FILL = { r: 239, g: 68, b: 68 };
const INK = { r: 255, g: 255, b: 255 };

// A 5x7 bitmap face. At 16px there is no room for a real font, and hinting a
// scalable one down to this size is exactly where small digits turn to mush.
const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPH_GAP = 1;

const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
};

// Samples per axis inside each output pixel. The badge is a circle with small
// text on it — both need antialiasing, and 4x4 coverage is cheap at this size.
const SUPERSAMPLE = 4;

/** The text on the badge. Anything over 99 collapses to "99+". */
export function badgeLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n > 99 ? "99+" : String(n);
}

function glyphOn(text: string, gx: number, gy: number): boolean {
  if (gy < 0 || gy >= GLYPH_H || gx < 0) return false;
  const cell = GLYPH_W + GLYPH_GAP;
  const index = Math.floor(gx / cell);
  if (index >= text.length) return false;
  const column = gx - index * cell;
  if (column >= GLYPH_W) return false;
  const rows = GLYPHS[text[index]];
  if (!rows) return false;
  return rows[Math.floor(gy)][Math.floor(column)] === "1";
}

export interface BadgeBitmap {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA, 4 bytes per pixel, top row first. */
  data: Buffer;
}

/**
 * Draws the badge into raw RGBA. Exported separately from the PNG encoder so
 * tests can assert on actual pixels rather than on an opaque blob.
 */
export function renderBadgeBitmap(text: string, size: number): BadgeBitmap {
  const data = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const radius = size / 2;

  const unitsWide = text.length * GLYPH_W + (text.length - 1) * GLYPH_GAP;
  // Hold the text clear of the circle's edge on both axes; the tighter of the
  // two constraints wins, so "99+" shrinks rather than clipping.
  const scale = Math.min((size * 0.74) / unitsWide, (size * 0.46) / GLYPH_H);
  const originX = centre - (unitsWide * scale) / 2;
  const originY = centre - (GLYPH_H * scale) / 2;

  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inCircle = 0;
      let inGlyph = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          const dx = px - centre;
          const dy = py - centre;
          if (dx * dx + dy * dy > radius * radius) continue;
          inCircle++;
          if (glyphOn(text, (px - originX) / scale, (py - originY) / scale)) {
            inGlyph++;
          }
        }
      }

      const offset = (y * size + x) * 4;
      if (inCircle === 0) continue; // stays fully transparent

      const alpha = inCircle / samples;
      // How much of this pixel's covered area is ink rather than fill
      const ink = inGlyph / inCircle;
      data[offset] = Math.round(FILL.r * (1 - ink) + INK.r * ink);
      data[offset + 1] = Math.round(FILL.g * (1 - ink) + INK.g * ink);
      data[offset + 2] = Math.round(FILL.b * (1 - ink) + INK.b * ink);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }

  return { width: size, height: size, data };
}

// --- Minimal PNG encoder ----------------------------------------------------
// Only what nativeImage needs to decode: 8-bit RGBA, no interlacing.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

export function encodePng(bitmap: BadgeBitmap): Buffer {
  const { width, height, data } = bitmap;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 (None) keeps this simple
  // and the images are tiny, so the compression loss doesn't matter.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A badge PNG for `count`, `size` pixels square. */
export function renderBadgePng(count: number, size: number): Buffer {
  return encodePng(renderBadgeBitmap(badgeLabel(count), size));
}
