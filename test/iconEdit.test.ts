import { describe, expect, it } from "vitest";
import { uploadToDiscard } from "../src/lib/iconEdit";

describe("uploadToDiscard", () => {
  it("discards an icon uploaded in this editing session", () => {
    expect(uploadToDiscard("custom:new.png", ["new.png"])).toBe("new.png");
  });

  // Deleting the saved file before the edit is saved would leave a cancelled
  // edit pointing at a missing file. Main deletes it on save instead.
  it("leaves the service's saved icon for the save to clean up", () => {
    expect(uploadToDiscard("custom:saved.png", [])).toBeNull();
    expect(uploadToDiscard("custom:saved.png", ["other.png"])).toBeNull();
  });

  it("has nothing to discard for a built-in or empty icon", () => {
    expect(uploadToDiscard("gmail.png", ["gmail.png"])).toBeNull();
    expect(uploadToDiscard("", [])).toBeNull();
  });
});
