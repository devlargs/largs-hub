// Z-order control for the UI layer (see CLAUDE.md). WebContentsView child
// reordering doesn't reliably control z-order on Windows, so while any React
// overlay is open the active service view is hidden instead.
//
// Ref-counted so nested overlays (context menu → modal) work: the view comes
// back only when the last one closes. Pure (see test/uiLayer.test.ts).

export interface UiLayerCounter {
  // An overlay opened: the service view must hide
  bringToFront(): void;
  // An overlay closed: the service view may show again once none are left
  sendToBack(): void;
}

export function createUiLayerCounter(
  setServiceViewVisible: (visible: boolean) => void,
): UiLayerCounter {
  let count = 0;
  return {
    bringToFront() {
      count++;
      // Always hide the active service view when any overlay is open
      setServiceViewVisible(false);
    },
    sendToBack() {
      count = Math.max(0, count - 1);
      // Only show the service view when ALL overlays are closed
      if (count === 0) setServiceViewVisible(true);
    },
  };
}
