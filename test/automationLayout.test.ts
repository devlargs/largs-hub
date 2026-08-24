import { describe, expect, it } from "vitest";
import {
  AUTOMATION_SPLIT_RATIO,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  MIN_SERVICE_WIDTH,
  computeAutomationLayout,
} from "../electron/automationLayout";

describe("computeAutomationLayout", () => {
  it("uses the plain ratio in the middle of the range", () => {
    // 1400px pane → 420px, inside both clamps
    const { panelWidth, serviceWidth } = computeAutomationLayout(1400);
    expect(panelWidth).toBe(Math.round(1400 * AUTOMATION_SPLIT_RATIO));
    expect(serviceWidth).toBe(1400 - panelWidth);
  });

  it("stops the panel shrinking below its minimum on a small window", () => {
    // 900px pane → the ratio wants 270px, too narrow for the form's rows
    expect(computeAutomationLayout(900).panelWidth).toBe(MIN_PANEL_WIDTH);
  });

  it("stops the panel growing without limit on a large display", () => {
    // 3772px pane (4K minus the sidebar) → the ratio wants 1132px
    expect(computeAutomationLayout(3772).panelWidth).toBe(MAX_PANEL_WIDTH);
  });

  it("always leaves the pane fully covered between the two panes", () => {
    for (const pane of [400, 640, 900, 1200, 1400, 1920, 2560, 3772]) {
      const { panelWidth, serviceWidth } = computeAutomationLayout(pane);
      expect(panelWidth + serviceWidth).toBe(pane);
    }
  });

  it("keeps the service pane usable, shrinking the panel to its minimum first", () => {
    // 700px pane: a 300px panel would leave 400px of service — still fine
    const layout = computeAutomationLayout(700);
    expect(layout.serviceWidth).toBeGreaterThanOrEqual(MIN_SERVICE_WIDTH);
    expect(layout.panelWidth).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH);
  });

  it("gives the panel the whole pane when a split would leave a sliver", () => {
    // 600px pane: the smallest usable split needs 300 + 360 = 660
    const { panelWidth, serviceWidth } = computeAutomationLayout(600);
    expect(panelWidth).toBe(600);
    expect(serviceWidth).toBe(0);
  });

  it("never exceeds the pane it is drawn in", () => {
    for (const pane of [1, 50, 200, 299, 300, 301]) {
      const { panelWidth } = computeAutomationLayout(pane);
      expect(panelWidth).toBeLessThanOrEqual(pane);
    }
  });

  it("returns nothing for a zero or nonsensical pane width", () => {
    expect(computeAutomationLayout(0)).toEqual({ panelWidth: 0, serviceWidth: 0 });
    expect(computeAutomationLayout(-100)).toEqual({ panelWidth: 0, serviceWidth: 0 });
    expect(computeAutomationLayout(NaN)).toEqual({ panelWidth: 0, serviceWidth: 0 });
  });

  // The panel is deliberately NOT monotonic across the whole range: below the
  // split threshold it covers the pane, and the moment a split becomes viable
  // it steps back to its minimum so the service view can appear. Monotonic
  // growth is the invariant once the split is in play.
  it("grows the panel monotonically once the split is viable", () => {
    let previous = 0;
    for (let pane = MIN_PANEL_WIDTH + MIN_SERVICE_WIDTH; pane <= 4000; pane += 20) {
      const { panelWidth, serviceWidth } = computeAutomationLayout(pane);
      expect(serviceWidth).toBeGreaterThanOrEqual(MIN_SERVICE_WIDTH);
      expect(panelWidth).toBeGreaterThanOrEqual(previous);
      previous = panelWidth;
    }
  });

  it("hands the pane over in one step rather than flickering at the threshold", () => {
    const threshold = MIN_PANEL_WIDTH + MIN_SERVICE_WIDTH;
    expect(computeAutomationLayout(threshold - 1).serviceWidth).toBe(0);
    expect(computeAutomationLayout(threshold).serviceWidth).toBe(MIN_SERVICE_WIDTH);
  });
});
