import { describe, expect, it } from "vitest";
import { ClipboardLike, imagesToUpload } from "../src/lib/clipboardImages";

const file = (name: string, type: string) => ({ name, type }) as unknown as File;
const item = (f: File) => ({ kind: "file", type: f.type, getAsFile: () => f });

function clipboard(opts: { items?: File[]; files?: File[]; text?: string }): ClipboardLike {
  return {
    items: (opts.items ?? []).map(item),
    files: opts.files ?? [],
    getData: (format) => (format === "text/plain" ? (opts.text ?? "") : ""),
  };
}

describe("imagesToUpload", () => {
  it("takes a screenshot that's only in the items", () => {
    const shot = file("image.png", "image/png");
    expect(imagesToUpload(clipboard({ items: [shot] }))).toEqual([shot]);
  });

  it("takes an image file copied in File Explorer or Finder", () => {
    const photo = file("photo.jpg", "image/jpeg");
    expect(imagesToUpload(clipboard({ files: [photo] }))).toEqual([photo]);
  });

  it("doesn't upload the same image twice when it's in both", () => {
    const shot = file("image.png", "image/png");
    expect(imagesToUpload(clipboard({ items: [shot], files: [shot] }))).toEqual([shot]);
  });

  it("takes several images at once", () => {
    const a = file("a.png", "image/png");
    const b = file("b.gif", "image/gif");
    expect(imagesToUpload(clipboard({ items: [a, b] }))).toEqual([a, b]);
  });

  it("lets text paste as text, even with a picture of it alongside", () => {
    const render = file("image.png", "image/png");
    expect(imagesToUpload(clipboard({ items: [render], text: "A1\tB1" }))).toEqual([]);
    expect(imagesToUpload(clipboard({ text: "just text" }))).toEqual([]);
  });

  it("ignores files that aren't images", () => {
    expect(imagesToUpload(clipboard({ files: [file("notes.pdf", "application/pdf")] }))).toEqual(
      [],
    );
  });

  it("copes with no items or files at all", () => {
    expect(imagesToUpload({ items: null, files: null, getData: () => "" })).toEqual([]);
  });
});
