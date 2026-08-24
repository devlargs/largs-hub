import { describe, expect, it } from "vitest";
import { customIconFileName, orphanedIconFiles, supersededIconFile } from "../electron/iconCleanup";

const withIcon = (icon: unknown) => ({ icon });

describe("customIconFileName", () => {
  it("reads the filename out of a custom icon", () => {
    expect(customIconFileName("custom:abc.png")).toBe("abc.png");
  });

  it("returns null for a built-in icon", () => {
    expect(customIconFileName("gmail")).toBeNull();
    expect(customIconFileName("")).toBeNull();
  });

  it("returns null for a custom prefix with nothing after it", () => {
    expect(customIconFileName("custom:")).toBeNull();
  });

  it("returns null for anything that isn't a string", () => {
    expect(customIconFileName(undefined)).toBeNull();
    expect(customIconFileName(null)).toBeNull();
    expect(customIconFileName(7)).toBeNull();
  });
});

describe("orphanedIconFiles", () => {
  it("keeps a file a service still points at", () => {
    expect(orphanedIconFiles(["a.png"], [withIcon("custom:a.png")])).toEqual([]);
  });

  it("returns files nothing references", () => {
    const services = [withIcon("custom:a.png"), withIcon("gmail")];
    expect(orphanedIconFiles(["a.png", "b.png", "c.png"], services)).toEqual(["b.png", "c.png"]);
  });

  it("treats every file as orphaned when there are no services", () => {
    expect(orphanedIconFiles(["a.png", "b.png"], [])).toEqual(["a.png", "b.png"]);
  });

  it("counts a file referenced by two services once", () => {
    const services = [withIcon("custom:a.png"), withIcon("custom:a.png")];
    expect(orphanedIconFiles(["a.png"], services)).toEqual([]);
  });

  it("is unbothered by services with no icon at all", () => {
    expect(orphanedIconFiles(["a.png"], [{}, withIcon(null)])).toEqual(["a.png"]);
  });
});

describe("supersededIconFile", () => {
  it("returns the old file when the icon is replaced", () => {
    expect(supersededIconFile("custom:old.png", "custom:new.png")).toBe("old.png");
  });

  it("returns the old file when a custom icon is swapped for a built-in one", () => {
    expect(supersededIconFile("custom:old.png", "gmail")).toBe("old.png");
    expect(supersededIconFile("custom:old.png", null)).toBe("old.png");
  });

  it("returns null when the icon didn't actually change", () => {
    expect(supersededIconFile("custom:same.png", "custom:same.png")).toBeNull();
  });

  it("returns null when the old icon wasn't an upload", () => {
    expect(supersededIconFile("gmail", "custom:new.png")).toBeNull();
    expect(supersededIconFile(undefined, "custom:new.png")).toBeNull();
  });

  // Duplicating a service copies the icon reference; the first removal must
  // not delete the file out from under the second.
  it("returns null while another service still points at the file", () => {
    expect(
      supersededIconFile("custom:shared.png", null, [withIcon("custom:shared.png")]),
    ).toBeNull();
  });

  it("returns the file once the last other reference is gone", () => {
    expect(supersededIconFile("custom:shared.png", null, [withIcon("custom:other.png")])).toBe(
      "shared.png",
    );
  });
});
