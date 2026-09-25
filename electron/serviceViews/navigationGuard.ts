import type { WebContentsView } from "electron";
import { mayRedirectInView, mayShowInView } from "../navigationPolicy";

// Keeps a service view's main frame on the service and its sign-in pages
// (navigationPolicy.ts decides). Link clicks and script navigations are checked
// in will-navigate, server redirects in will-redirect: a same-domain link can
// 30x to anywhere through an open redirect, and will-navigate never sees the
// hops (issue #123). A blocked navigation just doesn't happen; the service
// stays put, and the link can still be opened with "View Link".
export function attachNavigationGuard(view: WebContentsView, homeUrl: string, serviceHost: string) {
  const contents = view.webContents;
  // The current main-frame navigation's first URL, and whether a page (rather
  // than the app's own loadURL) started it.
  let startUrl: string | null = null;
  let pageInitiated = true;

  contents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
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
    if (!allowed) event.preventDefault();
  });
}
