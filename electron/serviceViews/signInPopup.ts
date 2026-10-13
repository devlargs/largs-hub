import { WebContentsView, shell } from "electron";
import { applyChromeIdentity } from "../chromeIdentity";
import { externalWebUrl } from "../externalLinks";
import { isSignInPopup, mayShowInView } from "../navigationPolicy";
import { getDeps } from "./state";

// "Sign in with Google" popups, opened as real popup windows.
//
// Google's sign-in button (Reddit's "Sign in as …", and many other sites)
// opens accounts.google.com with window.open() and waits for the popup to post
// the result back to its opener. The view's window-open handler used to load
// such URLs in place of the service, where the page has no opener: it threw
// "Cannot read properties of null (reading 'postMessage')" and the view went
// blank. These popups are allowed as child windows instead, sharing the
// service's session, so the opener link survives and the popup closes itself
// once the user picks an account.

function hostOf(url: string): string {
  try {
    return new URL(url).host || "(no host)";
  } catch {
    return "(unparseable URL)";
  }
}

/** Window options for a sign-in popup; Chromium adds the page's requested size. */
export function signInPopupOptions(): Electron.BrowserWindowConstructorOptions {
  const mainWindow = getDeps()?.getMainWindow();
  return {
    title: "Sign in",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    ...(mainWindow ? { parent: mainWindow } : {}),
  };
}

/**
 * Sets up each sign-in popup a service view opens: the Chrome identity (Firefox
 * on Google's sign-in pages, like the view), a navigation guard that keeps it
 * on the service and its sign-in hosts, and no nested popups.
 */
export function attachSignInPopups(view: WebContentsView, serviceHost: string) {
  view.webContents.on("did-create-window", (child, details) => {
    if (!isSignInPopup(details.url, details.disposition)) return;
    const contents = child.webContents;
    child.setMenuBarVisibility(false);
    void applyChromeIdentity(contents, details.url);
    // A refused hop leaves the popup on a page that looks like it's still
    // loading, so say which host it was (the URL itself carries sign-in tokens).
    const refuse = (event: Electron.Event, url: string) => {
      event.preventDefault();
      console.warn("[signInPopup] refused navigation to", hostOf(url));
    };
    contents.on("will-navigate", (event) => {
      if (!mayShowInView(event.url, serviceHost)) refuse(event, event.url);
    });
    contents.on("will-redirect", (event) => {
      if (event.isMainFrame && !mayShowInView(event.url, serviceHost)) refuse(event, event.url);
    });
    contents.setWindowOpenHandler(({ url }) => {
      const external = externalWebUrl(url);
      if (external) shell.openExternal(external);
      return { action: "deny" };
    });
  });
}
