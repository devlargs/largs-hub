import { BrowserWindow, WebContentsView } from "electron";
import { createShortcutHintTracker } from "../shortcutHints";

// The frameless window, the React UI layer drawn over it, and the link-preview
// overlay. One of each at most; null while the window is closed (macOS keeps
// the app running with no window).
export const windowState = {
  mainWindow: null as BrowserWindow | null,
  uiView: null as WebContentsView | null,
  linkPreviewView: null as WebContentsView | null,
};

export const getMainWindow = () => windowState.mainWindow;
export const getUiView = () => windowState.uiView;

// Numbers on the sidebar while Ctrl is held. Every view that can hold keyboard
// focus feeds it: the UI view and link preview here, the service views through
// the onKeyInput dep main.ts gives them.
export const shortcutHints = createShortcutHintTracker({
  onChange: (visible) => windowState.uiView?.webContents.send("shortcut-hints-changed", visible),
});
