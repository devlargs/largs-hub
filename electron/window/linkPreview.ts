import { WebContentsView, shell } from "electron";
import { linkPreviewBounds } from "../shared/layout";
import { loadWithChromeIdentity } from "../chromeIdentity";
import { externalWebUrl } from "../externalLinks";
import { shortcutHints, windowState } from "./state";

// Link preview modal: the page renders in a WebContentsView layered on top,
// while the React UI draws the modal chrome (backdrop, header, close button)
// around it. Both sides read the geometry from shared/layout.ts.

function getLinkPreviewBounds() {
  const { mainWindow } = windowState;
  if (!mainWindow) return { x: 0, y: 0, width: 0, height: 0 };
  const [width, height] = mainWindow.getContentSize();
  return linkPreviewBounds(width, height);
}

// Window resize: the preview keeps its place in the middle of the window
export function repositionLinkPreview() {
  windowState.linkPreviewView?.setBounds(getLinkPreviewBounds());
}

export function openLinkPreview(url: string, partition: string) {
  const { mainWindow, uiView } = windowState;
  if (!mainWindow || !uiView) return;
  closeLinkPreview();

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#1e1e2e");

  // A web link that tries to open a new window goes to the system browser.
  // Nothing else does: the preview shows arbitrary sites, so any other scheme
  // could launch an OS handler (issue #119).
  view.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    const external = externalWebUrl(popupUrl);
    if (external) shell.openExternal(external);
    return { action: "deny" };
  });

  view.webContents.on("before-input-event", (event, input) => {
    shortcutHints.handleInput(input);
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      closeLinkPreview();
    }
  });

  // Keep the URL shown in the modal header up to date
  view.webContents.on("did-navigate", (_event, navUrl) => {
    windowState.uiView?.webContents.send("link-preview-navigated", navUrl);
  });

  // Same Chrome disguise as the service views, applied before the page loads.
  // The header rewrite that goes with it is registered on the (shared)
  // service session in serviceViews/create.ts.
  loadWithChromeIdentity(view.webContents, url);
  mainWindow.contentView.addChildView(view);
  view.setBounds(getLinkPreviewBounds());
  windowState.linkPreviewView = view;

  uiView.webContents.send("link-preview-open", url);
}

export function closeLinkPreview() {
  const view = windowState.linkPreviewView;
  if (!view) return;
  windowState.mainWindow?.contentView.removeChildView(view);
  view.webContents.close();
  windowState.linkPreviewView = null;
  windowState.uiView?.webContents.send("link-preview-closed");
}
