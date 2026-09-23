import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  imagePathFor,
  markdownImage,
  parseImageDataUrl,
  rawImageUrl,
  validateIssueDraft,
} from "../electron/github/issueDraft";

const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString("base64")}`;

describe("validateIssueDraft", () => {
  it("accepts a titled draft, with or without a description", () => {
    expect(validateIssueDraft("Crash on launch", "It crashed")).toBeNull();
    expect(validateIssueDraft("Crash on launch", "")).toBeNull();
  });

  it("needs a title", () => {
    expect(validateIssueDraft("   ", "body")).toMatch(/title/);
    expect(validateIssueDraft(undefined, "body")).toMatch(/title/);
  });

  it("holds GitHub's length limits", () => {
    expect(validateIssueDraft("x".repeat(257), "")).toMatch(/too long/);
    expect(validateIssueDraft("t", "x".repeat(65_537))).toMatch(/too long/);
    expect(validateIssueDraft("t", 42)).not.toBeNull();
  });
});

describe("parseImageDataUrl", () => {
  it("reads a PNG and names its extension", () => {
    const parsed = parseImageDataUrl(dataUrl("image/png", Buffer.from([1, 2, 3])));
    expect(parsed).toEqual({ ok: true, bytes: Buffer.from([1, 2, 3]), ext: "png" });
    const jpeg = parseImageDataUrl(dataUrl("image/jpeg", Buffer.from([9])));
    expect(jpeg.ok && jpeg.ext).toBe("jpg");
  });

  it("refuses other types, junk and empty images", () => {
    expect(parseImageDataUrl(dataUrl("image/svg+xml", Buffer.from("<svg/>"))).ok).toBe(false);
    expect(parseImageDataUrl(dataUrl("text/html", Buffer.from("hi"))).ok).toBe(false);
    expect(parseImageDataUrl("not a data url").ok).toBe(false);
    expect(parseImageDataUrl(42).ok).toBe(false);
    expect(parseImageDataUrl("data:image/png;base64,").ok).toBe(false);
  });

  it("refuses an image over 10 MB", () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    const result = parseImageDataUrl(dataUrl("image/png", big));
    expect(result).toEqual({ ok: false, error: "Images can be 10 MB at most." });
  });
});

describe("image naming", () => {
  it("files images by year and month", () => {
    const when = new Date(Date.UTC(2026, 8, 23, 12));
    expect(imagePathFor(when, "abc", "png")).toBe("2026/09/abc.png");
  });

  it("points at the image branch's raw file", () => {
    expect(rawImageUrl("2026/09/abc.png")).toBe(
      "https://raw.githubusercontent.com/devlargs/largs-hub/issue-images/2026/09/abc.png",
    );
  });

  it("writes markdown that brackets in the alt text can't break", () => {
    expect(markdownImage("image", "https://x/y.png")).toBe("![image](https://x/y.png)");
    expect(markdownImage("a [b]", "u")).toBe("![a b](u)");
  });
});
