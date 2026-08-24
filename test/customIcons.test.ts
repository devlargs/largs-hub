import { describe, expect, it } from "vitest";
import path from "path";
import { resolveCustomIconPath } from "../electron/customIcons";

const DIR = path.resolve("/data/userData/custom-icons");

describe("resolveCustomIconPath", () => {
  it("resolves a plain file name inside the directory", () => {
    expect(resolveCustomIconPath("gmail.png", DIR)).toBe(path.join(DIR, "gmail.png"));
  });

  it("keeps names with spaces and dots", () => {
    expect(resolveCustomIconPath("My Icon v1.2.png", DIR)).toBe(
      path.join(DIR, "My Icon v1.2.png"),
    );
  });

  describe("traversal", () => {
    it("refuses relative escapes", () => {
      // These are what custom-icon://..%2F..%2F..%2Fsomething decodes to
      expect(resolveCustomIconPath("../../../etc/passwd", DIR)).toBe(
        path.join(DIR, "passwd"),
      );
      expect(resolveCustomIconPath("..", DIR)).toBeNull();
      expect(resolveCustomIconPath(".", DIR)).toBeNull();
    });

    it("strips directory components rather than following them", () => {
      // basename() reduces these to a leaf, so they can never escape
      const resolved = resolveCustomIconPath("../../secrets.txt", DIR);
      expect(resolved).toBe(path.join(DIR, "secrets.txt"));
      expect(resolved?.startsWith(DIR + path.sep)).toBe(true);
    });

    it("never returns a path outside the directory", () => {
      const attempts = [
        "../../../etc/passwd",
        "..\\..\\Windows\\System32\\config\\SAM",
        "/etc/shadow",
        "C:\\Windows\\win.ini",
        "....//....//evil.png",
        "%2e%2e%2fevil.png",
        "subdir/../../evil.png",
      ];
      for (const attempt of attempts) {
        const resolved = resolveCustomIconPath(attempt, DIR);
        if (resolved !== null) {
          expect(resolved.startsWith(DIR + path.sep)).toBe(true);
        }
      }
    });
  });

  describe("rejects non-names", () => {
    it("returns null for empty and non-string input", () => {
      expect(resolveCustomIconPath("", DIR)).toBeNull();
      expect(resolveCustomIconPath(null, DIR)).toBeNull();
      expect(resolveCustomIconPath(undefined, DIR)).toBeNull();
      expect(resolveCustomIconPath(42, DIR)).toBeNull();
      expect(resolveCustomIconPath({ toString: () => "x.png" }, DIR)).toBeNull();
    });
  });
});
