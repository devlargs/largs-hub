import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { APP_ID, appUserModelId } from "../electron/appUserModelId";

describe("appUserModelId", () => {
  it("is build.appId for the installed app, so badges and toasts work (#58)", () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.build.appId).toBe(APP_ID);
    expect(appUserModelId(true)).toBe(APP_ID);
  });

  it("is a different ID when running from source", () => {
    // Otherwise electron.exe's atom icon gets cached for the installed app
    expect(appUserModelId(false)).not.toBe(APP_ID);
  });
});
