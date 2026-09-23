import { describe, expect, it } from "vitest";
import {
  APPLY_BLUR_SCRIPT,
  AUTO_START_CALL_SCRIPT,
  HANGUP_SCRIPT,
  PRIVACY_HORIZONTAL_ID,
  PRIVACY_VERTICAL_ID,
  REMOVE_BLUR_SCRIPT,
  REMOVE_CALL_OVERLAY_SCRIPT,
  REMOVE_PRIVACY_SCRIPT,
  buildCallOverlayScript,
  buildPrivacyScript,
  clampPercent,
} from "../electron/serviceViews/scripts";

// Injected page scripts fail silently (executeJavaScript(...).catch(() => {})),
// so a syntax slip or a renamed id only shows up as an overlay or call that
// quietly stops working. Parse each one and pin its text.

// Throws on a syntax error without running anything.
const parses = (code: string) => new Function(code);

const DEFAULT_PRIVACY = {
  verticalPercent: 50,
  verticalOpacity: 100,
  horizontalPercent: 0,
  horizontalOpacity: 100,
};

const STATIC_SCRIPTS = {
  APPLY_BLUR_SCRIPT,
  REMOVE_BLUR_SCRIPT,
  REMOVE_PRIVACY_SCRIPT,
  AUTO_START_CALL_SCRIPT,
  HANGUP_SCRIPT,
  REMOVE_CALL_OVERLAY_SCRIPT,
};

describe("service view scripts", () => {
  it.each(Object.entries(STATIC_SCRIPTS))("%s parses and matches its snapshot", (_name, code) => {
    expect(() => parses(code)).not.toThrow();
    expect(code).toMatchSnapshot();
  });

  it("builds a parseable call overlay script with the countdown baked in", () => {
    const code = buildCallOverlayScript(17);
    expect(() => parses(code)).not.toThrow();
    expect(code).toContain("Ending call in 17s");
    expect(code).toMatchSnapshot();
  });

  it("keeps the m:ss timer regex escaped once it's inside the page", () => {
    // The source needs \\d so the page sees \d; a single backslash would be
    // eaten by the template literal and the answer detection would never fire.
    expect(buildCallOverlayScript(1)).toContain("/^\\d{1,2}:\\d{2}(:\\d{2})?$/");
  });
});

describe("buildPrivacyScript", () => {
  it("draws the default top-half cover and no side cover", () => {
    const code = buildPrivacyScript(DEFAULT_PRIVACY);
    expect(() => parses(code)).not.toThrow();
    expect(code).toContain(`['${PRIVACY_VERTICAL_ID}', 'position:fixed`);
    expect(code).toContain("height:50vh;opacity:1;");
    expect(code).toContain(`['${PRIVACY_HORIZONTAL_ID}', '']`);
    expect(code).toMatchSnapshot();
  });

  it("draws both covers with their own size and opacity", () => {
    const code = buildPrivacyScript({
      verticalPercent: 30,
      verticalOpacity: 80,
      horizontalPercent: 25,
      horizontalOpacity: 40,
    });
    expect(code).toContain("width:100vw;height:30vh;opacity:0.8;");
    expect(code).toContain("width:25vw;height:100vh;opacity:0.4;");
  });

  it("turns a cover off at size 0", () => {
    const code = buildPrivacyScript({ ...DEFAULT_PRIVACY, verticalPercent: 0 });
    expect(code).toContain(`['${PRIVACY_VERTICAL_ID}', '']`);
  });

  it("falls back to defaults for unset or corrupt settings", () => {
    const code = buildPrivacyScript({
      verticalPercent: undefined,
      verticalOpacity: "x",
      horizontalPercent: NaN,
      horizontalOpacity: null,
    });
    expect(code).toBe(buildPrivacyScript(DEFAULT_PRIVACY));
  });
});

describe("clampPercent", () => {
  it("rounds and clamps to 0–100", () => {
    expect(clampPercent(42.6, 0)).toBe(43);
    expect(clampPercent(-5, 50)).toBe(0);
    expect(clampPercent(250, 50)).toBe(100);
  });

  it("uses the fallback for non-numbers", () => {
    expect(clampPercent(undefined, 50)).toBe(50);
    expect(clampPercent(Infinity, 7)).toBe(7);
    expect(clampPercent("30", 7)).toBe(7);
  });
});
