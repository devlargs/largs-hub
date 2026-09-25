import os from "os";
import { Session, WebContents } from "electron";
import { currentChromeIdentity, detectHostPlatform, withChromeIdentityHeaders } from "./userAgent";
import {
  SignInIdentity,
  firefoxVersion,
  isSignInUrl,
  requestUsesSignInIdentity,
  signInIdentity,
  withSignInHeaders,
} from "./signInIdentity";
import { settleWithin } from "./settleWithin";

// How long a first load waits for the UA override before going ahead anyway.
// The command is normally answered in milliseconds; one that never answers
// used to leave the page unloaded for good.
const OVERRIDE_WAIT_MS = 1000;

// Applies the desktop-Chrome identity (userAgent.ts) to Electron objects.
//
// setUserAgent() only changes the UA string. The Client Hints and the
// page-visible navigator.userAgentData keep naming Electron, and Google's
// sign-in reads both (issues #106, #113). Chromium's own UA override, reached
// through the DevTools protocol, sets the string, the hint headers and
// navigator.userAgentData (getHighEntropyValues() included) from one piece of
// metadata. Because Chromium produces the values natively, nothing in the page
// looks patched, which a JS getter override would.
//
// Google's sign-in page still refuses that Chrome, so while a view's top-level
// page is on it, the view calls itself Firefox instead (signInIdentity.ts).

let signIn: SignInIdentity | null = null;

function currentSignInIdentity(): SignInIdentity {
  signIn ??= signInIdentity(
    detectHostPlatform(process.platform, os.release(), process.arch).os,
    firefoxVersion(new Date()),
  );
  return signIn;
}

// webContents id → whether its top-level page is a sign-in page. Set for every
// webContents the identity is applied to, and read by the header rewrite.
const onSignInPage = new Map<number, boolean>();

// Sends the page-visible half of the identity through Chromium's UA override.
// Throws when the debugger can't attach.
function sendOverride(webContents: WebContents, useSignIn: boolean): Promise<unknown> {
  if (!webContents.debugger.isAttached()) webContents.debugger.attach("1.3");
  if (useSignIn) {
    // No metadata: Firefox has no Client Hints for Chromium to report
    const { userAgent, navigatorPlatform } = currentSignInIdentity();
    return webContents.debugger.sendCommand("Emulation.setUserAgentOverride", {
      userAgent,
      platform: navigatorPlatform,
    });
  }
  const identity = currentChromeIdentity();
  return webContents.debugger.sendCommand("Emulation.setUserAgentOverride", {
    userAgent: identity.userAgent,
    platform: identity.navigatorPlatform,
    userAgentMetadata: identity.metadata,
  });
}

// Switches a view between the Chrome and sign-in identities as its top-level
// page moves on or off a sign-in host. The override is sent when the
// navigation starts (or is redirected), well before the new page commits.
function switchIdentity(webContents: WebContents, useSignIn: boolean): void {
  if (webContents.isDestroyed() || onSignInPage.get(webContents.id) === useSignIn) return;
  onSignInPage.set(webContents.id, useSignIn);
  webContents.setUserAgent(
    useSignIn ? currentSignInIdentity().userAgent : currentChromeIdentity().userAgent,
  );
  try {
    sendOverride(webContents, useSignIn).catch((err) =>
      console.warn("[chromeIdentity] UA override switch failed:", err),
    );
  } catch (err) {
    console.warn("[chromeIdentity] UA override switch unavailable:", err);
  }
}

function watchNavigations(webContents: WebContents): void {
  if (onSignInPage.has(webContents.id)) return;
  onSignInPage.set(webContents.id, false);
  const id = webContents.id;
  const onNavigation = (details: {
    url: string;
    isMainFrame: boolean;
    isSameDocument: boolean;
  }) => {
    if (details.isMainFrame && !details.isSameDocument) {
      switchIdentity(webContents, isSignInUrl(details.url));
    }
  };
  webContents.on("did-start-navigation", onNavigation);
  webContents.on("did-redirect-navigation", onNavigation);
  webContents.once("destroyed", () => onSignInPage.delete(id));
}

/**
 * Give one webContents the Chrome identity. Resolves once the override is in
 * place, so load the first URL after it: a page that loaded earlier would
 * have read Electron's values already. Never rejects, and never waits longer
 * than OVERRIDE_WAIT_MS: an override that hasn't been answered by then is
 * left to land when it does. If the debugger can't attach (e.g. DevTools holds
 * it), the UA string and the rewritten request headers still apply, and only
 * the page-visible metadata falls back.
 */
export async function applyChromeIdentity(webContents: WebContents): Promise<void> {
  webContents.setUserAgent(currentChromeIdentity().userAgent);
  watchNavigations(webContents);
  let override: Promise<unknown>;
  try {
    override = sendOverride(webContents, onSignInPage.get(webContents.id) === true);
  } catch (err) {
    console.warn("[chromeIdentity] UA metadata override unavailable:", err);
    return;
  }
  override.catch((err) => console.warn("[chromeIdentity] UA metadata override failed:", err));
  if (!(await settleWithin(override, OVERRIDE_WAIT_MS))) {
    console.warn("[chromeIdentity] UA metadata override not answered; loading anyway");
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
    const page = details.webContents;
    const useSignIn = requestUsesSignInIdentity({
      url: details.url,
      resourceType: details.resourceType,
      pageIsSignIn: page ? onSignInPage.get(page.id) : undefined,
      pageUrl: page && !page.isDestroyed() ? page.getURL() : undefined,
    });
    callback({
      requestHeaders: useSignIn
        ? withSignInHeaders(details.requestHeaders, currentSignInIdentity())
        : withChromeIdentityHeaders(details.requestHeaders, identity),
    });
  });
}
