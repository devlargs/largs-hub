import path from "path";
import { describe, expect, it } from "vitest";
import { splitFilename, uniqueSavePath } from "../electron/uniqueFilename";

// A fake filesystem: every path in the set is treated as already existing.
const existing = (...paths: string[]) => {
  const set = new Set(paths.map((p) => path.normalize(p)));
  return (filePath: string) => set.has(path.normalize(filePath));
};

const at = (...parts: string[]) => path.join(...parts);

describe("splitFilename", () => {
  it("splits a normal name", () => {
    expect(splitFilename("report.pdf")).toEqual({ stem: "report", ext: ".pdf" });
  });

  it("handles a name with no extension", () => {
    expect(splitFilename("README")).toEqual({ stem: "README", ext: "" });
  });

  it("treats a leading dot as part of the name, not an extension", () => {
    expect(splitFilename(".gitignore")).toEqual({ stem: ".gitignore", ext: "" });
  });

  it("keeps only the last part of a double extension, like Chrome", () => {
    expect(splitFilename("archive.tar.gz")).toEqual({ stem: "archive.tar", ext: ".gz" });
  });

  it("handles dots inside the stem", () => {
    expect(splitFilename("my.report.v2.pdf")).toEqual({ stem: "my.report.v2", ext: ".pdf" });
  });
});

describe("uniqueSavePath", () => {
  it("uses the plain name when nothing is in the way", () => {
    expect(uniqueSavePath("/dl", "report.pdf", existing())).toBe(at("/dl", "report.pdf"));
  });

  it("adds (1) when the name is taken", () => {
    const exists = existing(at("/dl", "report.pdf"));
    expect(uniqueSavePath("/dl", "report.pdf", exists)).toBe(at("/dl", "report (1).pdf"));
  });

  it("counts up past a run of existing copies", () => {
    const exists = existing(
      at("/dl", "report.pdf"),
      at("/dl", "report (1).pdf"),
      at("/dl", "report (2).pdf"),
    );
    expect(uniqueSavePath("/dl", "report.pdf", exists)).toBe(at("/dl", "report (3).pdf"));
  });

  it("fills a gap in the sequence rather than always appending", () => {
    const exists = existing(at("/dl", "report.pdf"), at("/dl", "report (2).pdf"));
    expect(uniqueSavePath("/dl", "report.pdf", exists)).toBe(at("/dl", "report (1).pdf"));
  });

  it("keeps the extension after the counter", () => {
    const exists = existing(at("/dl", "archive.tar.gz"));
    expect(uniqueSavePath("/dl", "archive.tar.gz", exists)).toBe(at("/dl", "archive.tar (1).gz"));
  });

  it("appends to an extensionless name", () => {
    const exists = existing(at("/dl", "LICENSE"));
    expect(uniqueSavePath("/dl", "LICENSE", exists)).toBe(at("/dl", "LICENSE (1)"));
  });

  it("does not mangle a dotfile", () => {
    const exists = existing(at("/dl", ".gitignore"));
    expect(uniqueSavePath("/dl", ".gitignore", exists)).toBe(at("/dl", ".gitignore (1)"));
  });

  it("never returns a path the caller said exists", () => {
    const taken = [
      at("/dl", "a.txt"),
      ...Array.from({ length: 40 }, (_, i) => at("/dl", `a (${i + 1}).txt`)),
    ];
    const result = uniqueSavePath("/dl", "a.txt", existing(...taken));
    expect(taken.map((p) => path.normalize(p))).not.toContain(path.normalize(result));
    expect(result).toBe(at("/dl", "a (41).txt"));
  });

  it("gives up and reuses the original name after too many attempts", () => {
    // Pathological: everything exists. Better to hand back something than spin.
    expect(uniqueSavePath("/dl", "a.txt", () => true)).toBe(at("/dl", "a.txt"));
  });

  it("preserves spaces and unicode in the name", () => {
    const exists = existing(at("/dl", "año nuevo.png"));
    expect(uniqueSavePath("/dl", "año nuevo.png", exists)).toBe(at("/dl", "año nuevo (1).png"));
  });
});
