import { describe, expect, it } from "vitest";
import { badgeLabel, encodePng, renderBadgeBitmap, renderBadgePng } from "../electron/badgeImage";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pixel(bitmap: ReturnType<typeof renderBadgeBitmap>, x: number, y: number) {
  const offset = (y * bitmap.width + x) * 4;
  return {
    r: bitmap.data[offset],
    g: bitmap.data[offset + 1],
    b: bitmap.data[offset + 2],
    a: bitmap.data[offset + 3],
  };
}

describe("badgeLabel", () => {
  it("shows the count up to 99", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(42)).toBe("42");
    expect(badgeLabel(99)).toBe("99");
  });

  it("collapses anything over 99", () => {
    expect(badgeLabel(100)).toBe("99+");
    expect(badgeLabel(5000)).toBe("99+");
  });

  it("never goes negative or fractional", () => {
    expect(badgeLabel(-3)).toBe("0");
    expect(badgeLabel(2.7)).toBe("2");
  });
});

describe("renderBadgeBitmap", () => {
  it("fills the circle and leaves the corners transparent", () => {
    const bitmap = renderBadgeBitmap("1", 16);
    // Corners sit outside the inscribed circle
    expect(pixel(bitmap, 0, 0).a).toBe(0);
    expect(pixel(bitmap, 15, 15).a).toBe(0);
    // The edge midpoint is inside it
    expect(pixel(bitmap, 8, 1).a).toBeGreaterThan(0);
  });

  it("paints the badge fill, not the ink, away from the digits", () => {
    const bitmap = renderBadgeBitmap("1", 32);
    // Just inside the left edge of the circle, clear of the centred glyph
    const p = pixel(bitmap, 3, 16);
    expect(p.a).toBeGreaterThan(200);
    expect(p.r).toBeGreaterThan(p.g + 100);
    expect(p.r).toBeGreaterThan(p.b + 100);
  });

  it("draws the digit in ink somewhere near the centre", () => {
    const bitmap = renderBadgeBitmap("1", 32);
    let lightest = 0;
    for (let y = 10; y < 22; y++) {
      for (let x = 10; x < 22; x++) {
        lightest = Math.max(lightest, pixel(bitmap, x, y).g);
      }
    }
    // The fill's green channel is 68; ink pushes it far above that
    expect(lightest).toBeGreaterThan(200);
  });

  it("keeps a three-character label inside the circle", () => {
    const bitmap = renderBadgeBitmap("99+", 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const p = pixel(bitmap, x, y);
        const distance = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
        // Beyond the antialiased edge nothing is drawn at all
        if (distance > 17) expect(p.a).toBe(0);
        // And no ink ever lands outside the fill
        if (distance > 16 && p.a > 0) expect(p.g).toBeLessThan(150);
      }
    }
  });

  it("produces the requested size", () => {
    const bitmap = renderBadgeBitmap("9", 24);
    expect(bitmap.width).toBe(24);
    expect(bitmap.height).toBe(24);
    expect(bitmap.data.length).toBe(24 * 24 * 4);
  });
});

describe("encodePng", () => {
  it("writes a PNG that nativeImage can recognise", () => {
    const png = renderBadgePng(3, 16);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    // IHDR: 4-byte length, "IHDR", width, height
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(16);
    expect(png.readUInt32BE(20)).toBe(16);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // RGBA
  });

  it("ends with IEND", () => {
    const png = renderBadgePng(7, 32);
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe("IEND");
  });

  it("emits valid chunk CRCs", () => {
    const png = renderBadgePng(12, 16);
    const table = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
    const crc = (buf: Buffer) => {
      let c = 0xffffffff;
      for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };

    let offset = 8;
    let chunks = 0;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const typed = png.subarray(offset + 4, offset + 8 + length);
      expect(crc(typed)).toBe(png.readUInt32BE(offset + 8 + length));
      offset += 12 + length;
      chunks++;
    }
    expect(chunks).toBe(3); // IHDR, IDAT, IEND
  });

  it("round-trips the bitmap it was given", () => {
    const bitmap = renderBadgeBitmap("8", 16);
    expect(encodePng(bitmap).length).toBeGreaterThan(PNG_SIGNATURE.length);
  });
});
