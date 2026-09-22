import { describe, expect, it } from "vitest";
import { MAC_UPDATE_SCRIPT, macAppBundlePath } from "../electron/macUpdate";

describe("macAppBundlePath", () => {
  it("finds the bundle an installed app runs from", () => {
    expect(macAppBundlePath("/Applications/Largs Hub.app/Contents/MacOS/Largs Hub")).toBe(
      "/Applications/Largs Hub.app",
    );
    expect(macAppBundlePath("/Users/me/Applications/Largs Hub.app/Contents/MacOS/Largs Hub")).toBe(
      "/Users/me/Applications/Largs Hub.app",
    );
  });

  // Read-only copies: replacing them would fail, so the DMG opens instead
  it("refuses the app running straight from the mounted DMG", () => {
    expect(
      macAppBundlePath("/Volumes/Largs Hub 0.1.63/Largs Hub.app/Contents/MacOS/Largs Hub"),
    ).toBeNull();
  });

  it("refuses a translocated copy", () => {
    expect(
      macAppBundlePath(
        "/private/var/folders/xy/abc/T/AppTranslocation/1234-ABCD/d/Largs Hub.app/Contents/MacOS/Largs Hub",
      ),
    ).toBeNull();
  });

  it("refuses anything that isn't inside an .app bundle", () => {
    expect(macAppBundlePath("/Users/me/largs-hub/node_modules/electron/dist/Electron")).toBeNull();
    expect(macAppBundlePath("/Applications/Largs Hub.app/Contents/Resources/x")).toBeNull();
    expect(macAppBundlePath("Largs Hub.app/Contents/MacOS/Largs Hub")).toBeNull();
    expect(macAppBundlePath("")).toBeNull();
  });
});

describe("MAC_UPDATE_SCRIPT", () => {
  it("waits for the old app, swaps the bundle, cleans up and relaunches", () => {
    const steps = [
      'kill -0 "$PID"',
      'hdiutil attach "$DMG"',
      'ditto "$SRC" "$NEW"',
      'mv "$APP" "$OLD"',
      'mv "$NEW" "$APP"',
      'mv "$OLD" "$APP"',
      'hdiutil detach "$MNT"',
      'rm -f "$DMG"',
      'open "$APP"',
    ];
    let from = 0;
    for (const step of steps) {
      const at = MAC_UPDATE_SCRIPT.indexOf(step, from);
      expect(at, step).toBeGreaterThan(-1);
      from = at;
    }
  });

  // A template literal would swallow "${TMPDIR…}" if it weren't escaped
  it("keeps shell variables intact", () => {
    expect(MAC_UPDATE_SCRIPT).toContain('"${TMPDIR:-/tmp}/largs-hub-update.XXXXXX"');
  });
});
