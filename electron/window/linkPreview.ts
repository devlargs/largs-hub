import { Session, WebContentsView, session, shell } from "electron";
import { linkPreviewBounds } from "../shared/layout";
import { applyChromeIdentityToSession, loadWithChromeIdentity } from "../chromeIdentity";
import { externalWebUrl } from "../externalLinks";
import { LINK_PREVIEW_PARTITION } from "../partitions";
import { hookDownloadSession } from "../downloads";
import { shortcutHints, windowState } from "./state";

// Link preview modal: the page renders in a WebContentsView layered on top,
// while the React UI draws the modal chrome (backdrop, header, close button)
// around it. Both sides read the geometry from shared/layout.ts.
//
// The previewed page is an arbitrary site, so it gets a session of its own
// rather than the service's (issue #125): it can't read or plant cookies,
// storage or service workers in a logged-in partition, and gets none of the
// service's permissions. The session is in-memory and wiped on every close.

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

let previewSession: Session | null = null;
// The wipe started by the last close. The next preview waits for it, so a
// quick close-and-reopen can't have its fresh cookies cleared mid-load.
let previewSessionCleared: Promise<void> = Promise.resolve();

// Session-wide setup, done once: the process keeps an in-memory session for as
// long as it runs, so the handlers stay registered.
function getPreviewSession(): Session {
  if (previewSession) return previewSession;
  const ses = session.fromPartition(LINK_PREVIEW_PARTITION);
  // Same Chrome disguise as the service views: the UA and the request-header
  // rewrite here, the page-visible half per view in loadWithChromeIdentity.
  applyChromeIdentityToSession(ses);
  // A preview is for reading a page: no camera, mic, notifications, clipboard,
  // location or anything else.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  previewSession = ses;
  return ses;
}

function clearPreviewSession() {
  const ses = previewSession;
  if (!ses) return;
  previewSessionCleared = Promise.all([ses.clearStorageData(), ses.clearCache()])
    .then(() => undefined)
    .catch((err) => console.warn("[linkPreview] Failed to clear preview session:", err));
}

export function openLinkPreview(url: string) {
  const { mainWindow, uiView } = windowState;
  if (!mainWindow || !uiView) return;
  closeLinkPreview();

  const view = new WebContentsView({
    webPreferences: {
      session: getPreviewSession(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#1e1e2e");

  // Downloads from the preview follow the same download settings as services.
  hookDownloadSession(view, LINK_PREVIEW_PARTITION);

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

  void previewSessionCleared.then(() => {
    // Applied before the page loads, so it never sees Electron's values.
    if (windowState.linkPreviewView === view) loadWithChromeIdentity(view.webContents, url);
  });
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
  // Nothing the previewed site stored outlives the preview.
  clearPreviewSession();
}
