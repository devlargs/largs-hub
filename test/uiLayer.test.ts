import { describe, expect, it, vi } from "vitest";
import { createUiLayerCounter } from "../electron/uiLayer";

describe("createUiLayerCounter", () => {
  it("hides the service view while an overlay is open", () => {
    const setVisible = vi.fn();
    const layer = createUiLayerCounter(setVisible);
    layer.bringToFront();
    expect(setVisible).toHaveBeenLastCalledWith(false);
    layer.sendToBack();
    expect(setVisible).toHaveBeenLastCalledWith(true);
  });

  it("keeps it hidden until the last nested overlay closes", () => {
    const setVisible = vi.fn();
    const layer = createUiLayerCounter(setVisible);
    layer.bringToFront();
    layer.bringToFront();
    layer.sendToBack();
    expect(setVisible).not.toHaveBeenCalledWith(true);
    layer.sendToBack();
    expect(setVisible).toHaveBeenLastCalledWith(true);
  });

  it("never counts below zero", () => {
    const setVisible = vi.fn();
    const layer = createUiLayerCounter(setVisible);
    layer.sendToBack();
    layer.sendToBack();
    layer.bringToFront();
    setVisible.mockClear();
    layer.sendToBack();
    expect(setVisible).toHaveBeenCalledWith(true);
  });
});
