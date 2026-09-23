import { computeAutomationLayout } from "../automationLayout";
import { SIDEBAR_WIDTH, TITLEBAR_HEIGHT, FIND_BAR_HEIGHT } from "../shared/layout";
import { getDeps, serviceViews, viewState } from "./state";

// The active service view's bounds: right of the sidebar, below the titlebar,
// minus whatever the find bar and the automation panel reserve.

// The find bar can't be drawn over a service view (child-view reordering is
// unreliable on Windows — see the z-order rule in CLAUDE.md), so it takes a
// strip out of the service view's bounds instead, the same way the automation
// panel takes a column.
let findBarOpen = false;

// When the Messenger automation panel is open the layout splits into a
// service pane (left) and the panel (right). The service view is resized to
// the left share so it stays visible instead of being hidden.
//
// The split is computed here and pushed to the renderer (automationLayout.ts),
// so the panel renders exactly the width main reserved for it instead of both
// sides recomputing a formula that can drift.
let automationSplitOpen = false;

export function isFindBarOpen(): boolean {
  return findBarOpen;
}

export function setAutomationSplitOpen(open: boolean) {
  automationSplitOpen = open;
  repositionActiveView();
  pushAutomationWidth();
}

// The panel's width, for the renderer. 0 when the split is closed.
export function getAutomationPanelWidth(): number {
  const mainWindow = getDeps()?.getMainWindow();
  if (!automationSplitOpen || !mainWindow) return 0;
  const [width] = mainWindow.getContentSize();
  return computeAutomationLayout(Math.max(0, width - SIDEBAR_WIDTH)).panelWidth;
}

// Tell the renderer how wide to draw itself. Sent on open/close and on every
// window resize, so the panel and the service pane can never disagree.
export function pushAutomationWidth() {
  getDeps()?.getUiView()?.webContents.send("automation-split-width", getAutomationPanelWidth());
}

// Reserve (or release) the find bar's strip at the top of the service pane.
// Closing also drops the native match highlighting from the page.
export function setFindBarOpen(open: boolean) {
  if (findBarOpen === open) return;
  findBarOpen = open;
  repositionActiveView();
  if (!open && viewState.activeServiceId) {
    const view = serviceViews.get(viewState.activeServiceId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.stopFindInPage("clearSelection");
      view.webContents.focus();
    }
  }
}

export function getViewBounds() {
  const mainWindow = getDeps()?.getMainWindow();
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: TITLEBAR_HEIGHT, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  const top = TITLEBAR_HEIGHT + (findBarOpen ? FIND_BAR_HEIGHT : 0);
  return {
    x: SIDEBAR_WIDTH,
    y: top,
    width: Math.max(0, width - SIDEBAR_WIDTH - getAutomationPanelWidth()),
    height: Math.max(0, height - top),
  };
}

export function repositionActiveView() {
  if (!viewState.activeServiceId) return;
  const view = serviceViews.get(viewState.activeServiceId);
  if (view) {
    view.setBounds(getViewBounds());
  }
}
