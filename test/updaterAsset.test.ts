import { describe, expect, it } from "vitest";
import { pickUpdateAsset } from "../electron/updater";

const assets = [
  { name: "Largs.Hub.Setup.exe" },
  { name: "Largs.Hub.Setup.exe.blockmap" },
  { name: "latest.yml" },
  { name: "Largs-Hub-arm64.dmg" },
  { name: "Largs-Hub-arm64.dmg.blockmap" },
  { name: "Largs-Hub-x64.dmg" },
];

describe("pickUpdateAsset", () => {
  it("picks the NSIS installer on Windows", () => {
    expect(pickUpdateAsset(assets, "win32", "x64")?.name).toBe("Largs.Hub.Setup.exe");
  });

  it("picks the DMG matching the Mac's CPU", () => {
    expect(pickUpdateAsset(assets, "darwin", "arm64")?.name).toBe("Largs-Hub-arm64.dmg");
    expect(pickUpdateAsset(assets, "darwin", "x64")?.name).toBe("Largs-Hub-x64.dmg");
  });

  it("offers nothing when this platform has no build in the release", () => {
    expect(pickUpdateAsset([{ name: "Largs.Hub.Setup.exe" }], "darwin", "arm64")).toBeNull();
    expect(pickUpdateAsset(assets, "linux", "x64")).toBeNull();
  });

  it("ignores malformed asset lists", () => {
    expect(pickUpdateAsset(undefined, "win32", "x64")).toBeNull();
    expect(pickUpdateAsset([null, { name: 3 }], "win32", "x64")).toBeNull();
  });
});
