import { describe, expect, it } from "vitest";
import { UpdateStatus, updateDescription, updateStatusColor } from "../src/lib/updateStatus";

const describeStatus = (status: UpdateStatus) =>
  updateDescription({ status, currentVersion: "0.1.66", newVersion: "0.1.67", percent: 42 });

describe("updateDescription", () => {
  it("words each step of an update", () => {
    expect(describeStatus("idle")).toBe("v0.1.66");
    expect(describeStatus("checking")).toBe("Checking...");
    expect(describeStatus("latest")).toBe("v0.1.66 — Up to date");
    expect(describeStatus("available")).toBe("v0.1.66 → v0.1.67 available");
    expect(describeStatus("manual")).toBe("v0.1.67 available — download it from GitHub");
    expect(describeStatus("downloading")).toBe("Downloading v0.1.67... 42%");
    expect(describeStatus("error")).toBe("Unable to check for updates");
  });
});

describe("updateStatusColor", () => {
  it("colours only the outcomes worth noticing", () => {
    expect(updateStatusColor("latest")).toBe("#a6e3a1");
    expect(updateStatusColor("error")).toBe("#f38ba8");
    expect(updateStatusColor("available")).toBe("var(--accent)");
    expect(updateStatusColor("manual")).toBe("var(--accent)");
    expect(updateStatusColor("idle")).toBeUndefined();
    expect(updateStatusColor("checking")).toBeUndefined();
    expect(updateStatusColor("downloading")).toBeUndefined();
  });
});
