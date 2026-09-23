import { Session, WebContents } from "electron";
import { currentChromeIdentity, withChromeIdentityHeaders } from "./userAgent";

// Applies the desktop-Chrome identity (userAgent.ts) to Electron objects.
//
// setUserAgent() only changes the UA string. The Client Hints and the
// page-visible navigator.userAgentData keep naming Electron, and Google's
// sign-in reads both (issues #106, #113). Chromium's own UA override, reached
// through the DevTools protocol, sets the string, the hint headers and
// navigator.userAgentData (getHighEntropyValues() included) from one piece of
// metadata. Because Chromium produces the values natively, nothing in the page
// looks patched, which a JS getter override would.

/**
 * Give one webContents the Chrome identity. Resolves once the override is in
 * place, so load the first URL after it: a page that loaded earlier would
 * have read Electron's values already. Never rejects. If the debugger can't
 * attach (e.g. DevTools holds it), the UA string and the rewritten request
 * headers still apply, and only the page-visible metadata falls back.
 */
export async function applyChromeIdentity(webContents: WebContents): Promise<void> {
  const identity = currentChromeIdentity();
  webContents.setUserAgent(identity.userAgent);
  try {
    if (!webContents.debugger.isAttached()) webContents.debugger.attach("1.3");
    await webContents.debugger.sendCommand("Emulation.setUserAgentOverride", {
      userAgent: identity.userAgent,
      platform: identity.navigatorPlatform,
      userAgentMetadata: identity.metadata,
    });
  } catch (err) {
    console.warn("[chromeIdentity] UA metadata override unavailable:", err);
  }
}

/** Apply the identity, then load `url` if the webContents is still around. */
export function loadWithChromeIdentity(webContents: WebContents, url: string): void {
  void applyChromeIdentity(webContents).then(() => {
    if (!webContents.isDestroyed()) webContents.loadURL(url);
  });
}

/**
 * Session-wide half of the disguise: the default UA for anything else created
 * in the session (popups), and the request-header rewrite, which also covers
 * requests the override doesn't reach, such as service workers. Registering
 * again on view recreation just replaces the previous listener.
 */
export function applyChromeIdentityToSession(session: Session): void {
  const identity = currentChromeIdentity();
  session.setUserAgent(identity.userAgent);
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: withChromeIdentityHeaders(details.requestHeaders, identity) });
  });
}
