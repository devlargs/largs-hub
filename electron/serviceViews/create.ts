import { WebContentsView, shell } from "electron";
import { store, Service, isSafeServiceUrl } from "../store";
import { shouldKeepInView } from "../navigationPolicy";
import { externalServiceUrl } from "../externalLinks";
import { hookDownloadSession } from "../downloads";
import { messengerAdapter } from "../badge-adapters/messenger";
import { DEFAULT_ZOOM } from "../zoom";
import { isPermissionAllowed } from "../servicePermissions";
import { quietNotificationsScript } from "../quietNotifications";
import {
  applyChromeIdentity,
  applyChromeIdentityToSession,
  loadWithChromeIdentity,
} from "../chromeIdentity";
import { getDeps, partitionFor } from "./state";
import { isFindBarOpen } from "./layout";
import { ZOOM_KEYS, getServiceZoom, openFindBarFor, stepServiceZoom } from "./findZoom";
import { applyPrivacyToView, isPrivacyMode } from "./overlays";
import { attachCallPopupHandler } from "./callWindow";
import { attachContextMenu } from "./contextMenu";
import { attachBadgeExtraction } from "./polling";
import { attachNavigationGuard } from "./navigationGuard";

// Build one service's WebContentsView: session partition, UA spoofing,
// permission policy, per-load re-injection, popups and keyboard shortcuts.
// Session-level listeners must only be registered once per partition.
//
// `switchToService` is how Ctrl+1-9 inside the page switches services; it's
// passed in by visibility.ts, which owns switching.
export function createServiceView(
  service: Service,
  switchToService: (serviceId: string) => void,
): WebContentsView {
  const partition = partitionFor(service.id);

  // Hostname (no "www.") used to pick the badge adapter, detect call-capable
  // services (Messenger etc.) and decide which links stay in the view.
  let serviceHost = "";
  try {
    serviceHost = new URL(service.url).hostname.replace(/^www\./, "");
  } catch {
    // invalid URL — no adapter, title extraction still applies
  }

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.setBackgroundColor("#00000000");

  // Look like desktop Chrome on this OS so sites like Google and WhatsApp
  // don't reject Electron (chromeIdentity.ts, issues #106 and #113). The
  // session half covers OAuth popups and every request's headers; the view
  // half (applied before the first load, below) covers the page's own view
  // of navigator.userAgentData.
  applyChromeIdentityToSession(view.webContents.session);

  // Electron underlines misspellings but only once a dictionary is chosen.
  // macOS uses the OS spellchecker and rejects the call, hence the guard.
  if (process.platform !== "darwin") {
    try {
      view.webContents.session.setSpellCheckerLanguages(["en-US"]);
    } catch {
      // Dictionary unavailable — the page simply goes unchecked.
    }
  }

  // Zoom is per service and persisted, so re-apply it on every load: a
  // navigation resets the view's zoom factor back to 100%.
  view.webContents.on("did-finish-load", () => {
    const zoom = getServiceZoom(service.id);
    if (zoom !== DEFAULT_ZOOM) view.webContents.setZoomFactor(zoom);
  });

  // findInPage results drive the "3/12" counter in the find bar.
  view.webContents.on("found-in-page", (_event, result) => {
    getDeps()?.getUiView()?.webContents.send("find-results", {
      serviceId: service.id,
      matches: result.matches,
      activeMatchOrdinal: result.activeMatchOrdinal,
    });
  });

  // Deny-by-default permission policy (servicePermissions.ts). Both handlers
  // read the service from the store on every call rather than this captured
  // copy, so flipping its Notifications, Microphone or Camera switch takes
  // effect at once: Chromium asks the check handler before it shows each
  // notification. They judge the frame that's asking, not the service's URL,
  // so an auth page or third-party iframe in the view can't use the service's
  // camera and mic grant (issue #114). The session is shared with the call
  // window, which goes through the same handlers. Setting the handlers is
  // idempotent per session, so calling it again on view recreation is safe.
  const liveService = () => store.get("services").find((s) => s.id === service.id);
  view.webContents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
    callback(isPermissionAllowed(liveService(), permission, details.requestingUrl, mediaTypes));
  });
  view.webContents.session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) =>
    isPermissionAllowed(
      liveService(),
      permission,
      requestingOrigin,
      details.mediaType ? [details.mediaType] : [],
    ),
  );

  // Messenger/Facebook calls reopen in an in-app call window (callWindow.ts).
  const isCallService = messengerAdapter.matches(serviceHost);
  if (isCallService) attachCallPopupHandler(view, partition);

  if (isSafeServiceUrl(service.url)) {
    loadWithChromeIdentity(view.webContents, service.url);
  } else {
    void applyChromeIdentity(view.webContents);
  }

  // Apply mute state
  if (service.muted) {
    view.webContents.setAudioMuted(true);
  }

  // Muting the view doesn't reach the sound the OS plays with a native
  // notification, so those are made silent from inside the page as well
  // (quietNotifications.ts). Each load starts a fresh document, so it's
  // installed on every one, with the service's current Sound setting.
  view.webContents.on("dom-ready", () => {
    const muted = liveService()?.muted === true;
    view.webContents.executeJavaScript(quietNotificationsScript(muted), true).catch(() => {});
  });

  hookDownloadSession(view, partition);

  // A navigation/reload drops the injected overlay, so re-apply it per load
  // (read from the store — the captured `service` goes stale after an edit).
  view.webContents.on("dom-ready", () => {
    if (isPrivacyMode(service.id)) applyPrivacyToView(view);
  });

  attachContextMenu(view, service.id);
  attachBadgeExtraction(view, service, serviceHost);

  // Browser shortcuts have to be intercepted here too — a service view with
  // focus never lets these reach the renderer's window keydown handler.
  view.webContents.on("before-input-event", (event, input) => {
    const deps = getDeps();
    deps?.onKeyInput(input);
    if (input.type === "keyDown" && input.key === "Escape" && isFindBarOpen()) {
      event.preventDefault();
      deps?.getUiView()?.webContents.send("close-find-bar");
      return;
    }
    // Zoom tolerates shift: "+" is shift+"=" on most layouts, so requiring an
    // unshifted key would break the shortcut people actually press.
    if (
      input.type === "keyDown" &&
      input.control &&
      !input.alt &&
      !input.meta &&
      ZOOM_KEYS[input.key] !== undefined
    ) {
      event.preventDefault();
      stepServiceZoom(service.id, ZOOM_KEYS[input.key]);
      return;
    }
    if (input.type === "keyDown" && input.control && !input.shift && !input.alt && !input.meta) {
      if (input.key.toLowerCase() === "f") {
        event.preventDefault();
        openFindBarFor(service.id);
        return;
      }
      const num = parseInt(input.key, 10);
      if (num >= 1 && num <= 9) {
        const services = store.get("services");
        const target = services[num - 1];
        if (target) {
          event.preventDefault();
          switchToService(target.id);
          deps?.getUiView()?.webContents.send("service-switched", target.id);
        }
      }
    }
  });

  // External-link policy for the popup handler (the navigation guard applies
  // the same rule). A URL "stays in view" only if it's the service's own domain or
  // an allowlisted auth provider; everything else is treated as an external
  // link and opened in the in-app preview popup.
  const keepInView = (targetUrl: string): boolean => shouldKeepInView(targetUrl, serviceHost);

  // Popups: keep same-domain/auth popups in the view. External http(s) links are
  // ignored on click — they neither redirect the service nor open the system
  // browser. To open one, users right-click it and choose "View Link" (which
  // opens the preview popup directly).
  view.webContents.setWindowOpenHandler(({ url, disposition }) => {
    // Messenger/Facebook launch a call with window.open("about:blank", …) and
    // then point the popup at their /groupcall/ page. We can't recognise it by
    // the popup URL (it's about:blank), so we key on the new-window disposition
    // plus a call-capable service, and allow the (hidden) popup so
    // attachCallPopupHandler can read the real call URL and reopen it in the
    // in-app call window (issue #59).
    if (disposition === "new-window" && isCallService) {
      return { action: "allow", overrideBrowserWindowOptions: { show: false } };
    }
    if (/^https?:/i.test(url)) {
      // Same-domain / auth links navigate in place; external http(s) links are
      // ignored so users open them via the "View Link" context menu instead.
      if (keepInView(url)) view.webContents.loadURL(url);
      return { action: "deny" };
    }
    // mailto: and tel: still hand off to the OS. Any other scheme is dropped:
    // ms-msdt:, search-ms:, file: and the like launch OS handlers (issue #119).
    const external = externalServiceUrl(url);
    if (external) shell.openExternal(external);
    return { action: "deny" };
  });

  // Link clicks, script navigations and server redirects to anywhere else are
  // cancelled, so the service stays put (navigationGuard.ts).
  attachNavigationGuard(view, service.url, serviceHost);

  return view;
}
