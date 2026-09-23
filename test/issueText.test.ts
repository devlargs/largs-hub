import { describe, expect, it } from "vitest";
import { insertAt, replacePlaceholder, uploadPlaceholder } from "../src/lib/issueText";

describe("uploadPlaceholder", () => {
  it("looks like GitHub's own", () => {
    expect(uploadPlaceholder("image.png")).toBe('<!-- Uploading "image.png"… -->');
  });
});

describe("insertAt", () => {
  it("inserts into an empty description as is", () => {
    expect(insertAt("", 0, "X")).toEqual({ text: "X", cursor: 1 });
  });

  it("puts the snippet on its own line mid-text", () => {
    expect(insertAt("abcdef", 3, "X")).toEqual({ text: "abc\nX\ndef", cursor: 6 });
  });

  it("doesn't add blank lines where a line break already is", () => {
    expect(insertAt("abc\ndef", 4, "X")).toEqual({ text: "abc\nX\ndef", cursor: 6 });
    expect(insertAt("abc\n", 4, "X")).toEqual({ text: "abc\nX", cursor: 5 });
  });

  it("replaces a selection", () => {
    expect(insertAt("abc SEL def", 4, "X", 7)).toEqual({ text: "abc \nX\n def", cursor: 7 });
  });
});

describe("replacePlaceholder", () => {
  const p = uploadPlaceholder("image.png");

  it("swaps the placeholder for the image", () => {
    expect(replacePlaceholder(`before\n${p}\nafter`, p, "![image](u)")).toBe(
      "before\n![image](u)\nafter",
    );
  });

  it("removes the placeholder and its line when the upload failed", () => {
    expect(replacePlaceholder(`before\n${p}\nafter`, p, "")).toBe("before\nafter");
    expect(replacePlaceholder(`before\n${p}`, p, "")).toBe("before\n");
  });

  it("leaves text alone once the placeholder was edited away", () => {
    expect(replacePlaceholder("typed over", p, "![image](u)")).toBe("typed over");
  });
});
