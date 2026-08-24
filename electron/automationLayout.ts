// Width of the Messenger automation panel, which takes the right share of a
// split with the service view.
//
// A flat percentage doesn't survive the range of window sizes this app runs at:
// at 1000px it leaves a panel too narrow for its own two-column rows, and on a
// 4K display it grows to over a thousand pixels of mostly empty form. So the
// ratio is clamped, and below the point where a split would leave the service
// pane unusable the panel takes the whole pane instead.
//
// Main owns this calculation and pushes the result to the renderer, rather than
// both sides computing the same formula and drifting apart.

export const AUTOMATION_SPLIT_RATIO = 0.3;
// Below this the form's side-by-side rows (min/max seconds) stop fitting.
export const MIN_PANEL_WIDTH = 300;
// Past this the panel is just a wide form with a lot of empty space.
export const MAX_PANEL_WIDTH = 460;
// The service pane needs at least this much to stay worth showing; under it the
// panel goes full width and the service view is hidden behind it.
export const MIN_SERVICE_WIDTH = 360;

export interface AutomationLayout {
  // Panel width in px.
  panelWidth: number;
  // What's left for the service view. 0 means the panel covers the whole pane.
  serviceWidth: number;
}

// `paneWidth` is the space right of the sidebar — the service view and the
// panel share it.
export function computeAutomationLayout(paneWidth: number): AutomationLayout {
  if (!Number.isFinite(paneWidth) || paneWidth <= 0) {
    return { panelWidth: 0, serviceWidth: 0 };
  }

  const ideal = Math.round(paneWidth * AUTOMATION_SPLIT_RATIO);
  let panelWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, ideal));

  // The panel can never be wider than the pane holding it.
  if (panelWidth >= paneWidth) {
    return { panelWidth: paneWidth, serviceWidth: 0 };
  }
  // Too little room left for the service: give the panel everything rather than
  // showing a sliver of Messenger beside it.
  if (paneWidth - panelWidth < MIN_SERVICE_WIDTH) {
    // Shrinking the panel back to its minimum can still save the split.
    const shrunk = paneWidth - MIN_SERVICE_WIDTH;
    if (shrunk >= MIN_PANEL_WIDTH) {
      panelWidth = shrunk;
    } else {
      return { panelWidth: paneWidth, serviceWidth: 0 };
    }
  }

  return { panelWidth, serviceWidth: paneWidth - panelWidth };
}
