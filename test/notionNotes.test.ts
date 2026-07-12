import { describe, expect, it } from "vitest";
import {
  blocksToContent,
  mapWithConcurrency,
  normalizeDatabaseId,
  richText,
  sanitizeNoteInput,
} from "../electron/notionNotes";

describe("normalizeDatabaseId", () => {
  it("accepts a plain 32-char hex id", () => {
    expect(normalizeDatabaseId("0123456789abcdef0123456789abcdef")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
  });

  it("accepts a dashed UUID and preserves the dashes", () => {
    expect(normalizeDatabaseId("01234567-89ab-cdef-0123-456789abcdef")).toBe(
      "01234567-89ab-cdef-0123-456789abcdef",
    );
  });

  it("extracts the id from a full Notion URL", () => {
    expect(
      normalizeDatabaseId("https://www.notion.so/me/0123456789abcdef0123456789abcdef?v=abc"),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeDatabaseId("  0123456789abcdef0123456789abcdef  ")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
  });

  it("rejects values with no id in them", () => {
    expect(normalizeDatabaseId("not-a-database")).toBeNull();
    expect(normalizeDatabaseId("")).toBeNull();
  });
});

describe("richText", () => {
  it("returns no chunks for empty content", () => {
    expect(richText("")).toEqual([]);
  });

  it("keeps short content as a single chunk", () => {
    expect(richText("hello")).toEqual([{ type: "text", text: { content: "hello" } }]);
  });

  it("splits content at Notion's 2000-char rich_text limit", () => {
    const chunks = richText("a".repeat(4001));
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text.content).toHaveLength(2000);
    expect(chunks[1].text.content).toHaveLength(2000);
    expect(chunks[2].text.content).toHaveLength(1);
  });
});

describe("blocksToContent", () => {
  const paragraph = (text: string) => ({
    id: "b",
    type: "paragraph",
    paragraph: { rich_text: [{ plain_text: text }] },
  });

  it("joins paragraphs into a text note", () => {
    const content = blocksToContent([paragraph("one"), paragraph("two")]);
    expect(content).toEqual({ kind: "text", text: "one\ntwo", items: [], imageUrl: undefined });
  });

  it("classifies notes with to_do blocks as lists", () => {
    const content = blocksToContent([
      { id: "b", type: "to_do", to_do: { rich_text: [{ plain_text: "task" }], checked: true } },
    ]);
    expect(content.kind).toBe("list");
    expect(content.items).toEqual([{ text: "task", checked: true }]);
  });

  it("takes only the first image and reads file or external urls", () => {
    const content = blocksToContent([
      { id: "1", type: "image", image: { type: "file", file: { url: "https://a/img1" } } },
      { id: "2", type: "image", image: { type: "external", external: { url: "https://a/img2" } } },
    ]);
    expect(content.imageUrl).toBe("https://a/img1");
  });

  it("prefixes bulleted and numbered list items", () => {
    const content = blocksToContent([
      { id: "b", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "x" }] } },
    ]);
    expect(content.text).toBe("• x");
  });

  it("trims trailing empty lines but keeps interior ones", () => {
    const content = blocksToContent([paragraph("one"), paragraph(""), paragraph("two"), paragraph("")]);
    expect(content.text).toBe("one\n\ntwo");
  });

  it("skips unknown block types", () => {
    const content = blocksToContent([
      { id: "b", type: "synced_block" },
      paragraph("kept"),
    ]);
    expect(content.text).toBe("kept");
  });
});

describe("sanitizeNoteInput", () => {
  const valid = {
    title: "t",
    kind: "text",
    text: "body",
    items: [],
    pinned: true,
  };

  it("accepts a valid text note", () => {
    expect(sanitizeNoteInput(valid)).toEqual({ ...valid, image: undefined });
  });

  it("rejects non-objects and missing fields", () => {
    expect(sanitizeNoteInput(null)).toBeNull();
    expect(sanitizeNoteInput("nope")).toBeNull();
    expect(sanitizeNoteInput({ ...valid, title: 5 })).toBeNull();
    expect(sanitizeNoteInput({ ...valid, kind: "drawing" })).toBeNull();
    expect(sanitizeNoteInput({ ...valid, items: "x" })).toBeNull();
  });

  it("coerces item checked flags to real booleans", () => {
    const input = sanitizeNoteInput({
      ...valid,
      kind: "list",
      items: [{ text: "a", checked: "yes" }],
    });
    expect(input?.items).toEqual([{ text: "a", checked: false }]);
  });

  it("rejects malformed items", () => {
    expect(sanitizeNoteInput({ ...valid, items: [{ checked: true }] })).toBeNull();
  });

  it("accepts keep/remove/upload image actions and rejects malformed ones", () => {
    expect(sanitizeNoteInput({ ...valid, image: { action: "keep" } })?.image).toEqual({
      action: "keep",
    });
    expect(sanitizeNoteInput({ ...valid, image: { action: "remove" } })?.image).toEqual({
      action: "remove",
    });
    const upload = { action: "upload", fileName: "a.png", mimeType: "image/png", base64: "aGk=" };
    expect(sanitizeNoteInput({ ...valid, image: upload })?.image).toEqual(upload);
    expect(sanitizeNoteInput({ ...valid, image: { action: "upload" } })).toBeNull();
    expect(sanitizeNoteInput({ ...valid, image: { action: "shrink" } })).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order in the results", async () => {
    const results = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5));
      return n * 10;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("handles an empty input", async () => {
    expect(await mapWithConcurrency([], 3, async (n) => n)).toEqual([]);
  });

  it("never runs more than the requested number of workers at once", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});
