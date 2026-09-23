import { WebContentsView, shell } from "electron";
import { store, Service, isSafeServiceUrl } from "../store";
import { shouldKeepInView } from "../navigationPolicy";
import { hookDownloadSession } from "../downloads";
import { messengerAdapter } from "../badge-adapters/messenger";
import { DEFAULT_ZOOM } from "../zoom";
import { isPermissionAllowed } from "../servicePermissions";
import { quietNotificationsScript } from "../quietNotifications";
import { spoofedUserAgent, withChromeIdentityHeaders } from "../userAgent";
import { getDeps, partitionFor } from "./state";
import { isFindBarOpen } from "./layout";
import { ZOOM_KEYS, getServiceZoom, openFindBarFor, stepServiceZoom } from "./findZoom";
import { applyPrivacyToView, isPrivacyMode } from "./overlays";
import { attachCallPopupHandler } from "./callWindow";
import { attachContextMenu } from "./contextMenu";
import { attachBadgeExtraction } from "./polling";

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

  // Spoof user agent so sites like Google and WhatsApp don't reject Electron
  const chromeVersion = process.versions.chrome;
  const spoofedUA = spoofedUserAgent(chromeVersion);
  view.webContents.setUserAgent(spoofedUA);

  // Also set at session level so OAuth popups inherit the spoofed UA
  view.webContents.session.setUserAgent(spoofedUA);

  // The UA string is only half the disguise: Chromium also sends User-Agent
  // Client Hints, and Electron's name the runtime, which is what makes Google
  // sign-in answer "this browser or app may not be secure" (issue #106).
  // Rewriting them on the way out is the only place they can be reached.
  // Registering the listener again on view recreation just replaces it.
  view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: withChromeIdentityHeaders(details.requestHeaders, chromeVersion) });
  });

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
  // copy, so flipping its Notifications toggle takes effect at once: Chromium
  // asks the check handler before it shows each notification. Setting the
  // handlers is idempotent per session, so calling it again on view
  // recreation is safe.
  const liveService = () => store.get("services").find((s) => s.id === service.id);
  view.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isPermissionAllowed(liveService(), permission));
  });
  view.webContents.session.setPermissionCheckHandler((_wc, permission) =>
    isPermissionAllowed(liveService(), permission),
  );

  // Messenger/Facebook calls reopen in an in-app call window (callWindow.ts).
  const isCallService = messengerAdapter.matches(serviceHost);
  if (isCallService) attachCallPopupHandler(view, partition, spoofedUA);

  if (isSafeServiceUrl(service.url)) {
    view.webContents.loadURL(service.url);
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

  attachContextMenu(view, service.id, partition);
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

  // External-link policy shared by the popup handler and the will-navigate
  // guard below. A URL "stays in view" only if it's the service's own domain or
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
    // Non-http schemes (mailto:, tel:, …) still hand off to the OS.
    shell.openExternal(url);
    return { action: "deny" };
  });

  // A plain in-page link click to an external site would navigate the whole
  // service view away and blank the service. Cancel it so the service stays put;
  // the link can still be opened via the "View Link" context menu.
  view.webContents.on("will-navigate", (event, url) => {
    if (/^https?:/i.test(url) && !keepInView(url)) {
      event.preventDefault();
    }
  });

  return view;
}
