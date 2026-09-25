import type { WebContentsView } from "electron";
import { mayRedirectInView, mayShowInView } from "../navigationPolicy";
import { identityChangesAt, loadWithIdentityFor } from "../chromeIdentity";

// Keeps a service view's main frame on the service and its sign-in pages
// (navigationPolicy.ts decides). Link clicks and script navigations are checked
// in will-navigate, server redirects in will-redirect: a same-domain link can
// 30x to anywhere through an open redirect, and will-navigate never sees the
// hops (issue #123). A blocked navigation just doesn't happen; the service
// stays put, and the link can still be opened with "View Link".
//
// An allowed redirect onto or off Google's sign-in page is restarted instead
// of followed, so the page gets the right identity from the start
// (chromeIdentity.ts, issue #106). The restart is judged as the redirect
// chain it continues, not as a fresh navigation by the app.
export function attachNavigationGuard(view: WebContentsView, homeUrl: string, serviceHost: string) {
  const contents = view.webContents;
  // The current main-frame navigation's first URL, and whether a page (rather
  // than the app's own loadURL) started it.
  let startUrl: string | null = null;
  let pageInitiated = true;
  // A redirect being restarted with a new identity, and the context of the
  // navigation it belongs to.
  let restarting: { url: string; startUrl: string | null; pageInitiated: boolean } | null = null;

  contents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    if (restarting && details.url === restarting.url) {
      ({ startUrl, pageInitiated } = restarting);
      restarting = null;
      return;
    }
    restarting = null;
    startUrl = details.url;
    pageInitiated = details.initiator != null;
  });

  // will-navigate only fires for the main frame, and never for the app's own
  // loadURL, so this is every page-initiated navigation of the view.
  contents.on("will-navigate", (event) => {
    if (!mayShowInView(event.url, serviceHost)) event.preventDefault();
  });

  contents.on("will-redirect", (event) => {
    // Iframes are the page's own business; only the view itself is guarded.
    if (!event.isMainFrame) return;
    const allowed = mayRedirectInView({
      url: event.url,
      serviceHost,
      startUrl,
      pageInitiated,
      homeUrl,
    });
    if (!allowed) {
      event.preventDefault();
    } else if (identityChangesAt(contents, event.url)) {
      event.preventDefault();
      restarting = { url: event.url, startUrl, pageInitiated };
      void loadWithIdentityFor(contents, event.url);
    }
  });
}
