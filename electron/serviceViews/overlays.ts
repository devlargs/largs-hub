import { WebContentsView } from "electron";
import { store } from "../store";
import { serviceViews } from "./state";
import {
  APPLY_BLUR_SCRIPT,
  REMOVE_BLUR_SCRIPT,
  REMOVE_PRIVACY_SCRIPT,
  buildPrivacyScript,
} from "./scripts";

// Blur-when-inactive and privacy-mode overlays, injected into the page itself
// since nothing native can be drawn above a service view. Purely visual — the
// page underneath keeps working (the overlays never take pointer events).

function inject(view: WebContentsView, script: string) {
  if (view.webContents.isDestroyed()) return;
  view.webContents.executeJavaScript(script).catch(() => {});
}

export function applyBlurToView(view: WebContentsView) {
  inject(view, APPLY_BLUR_SCRIPT);
}

export function removeBlurFromView(view: WebContentsView) {
  inject(view, REMOVE_BLUR_SCRIPT);
}

// Each cover has its own size and opacity in the global privacy settings. Re-
// applied on every load since a navigation wipes the injected elements.
export function applyPrivacyToView(view: WebContentsView) {
  if (view.webContents.isDestroyed()) return;
  inject(
    view,
    buildPrivacyScript({
      verticalPercent: store.get("privacyCoverPercent"),
      verticalOpacity: store.get("privacyOpacity"),
      horizontalPercent: store.get("privacyHorizontalPercent"),
      horizontalOpacity: store.get("privacyHorizontalOpacity"),
    }),
  );
}

export function removePrivacyFromView(view: WebContentsView) {
  inject(view, REMOVE_PRIVACY_SCRIPT);
}

export function isPrivacyMode(serviceId: string): boolean {
  return store.get("services").find((s) => s.id === serviceId)?.privacyMode === true;
}

export function isBlurWhenInactive(serviceId: string): boolean {
  return store.get("services").find((s) => s.id === serviceId)?.blurWhenInactive === true;
}

// Re-inject the overlay everywhere it's active, so a settings change takes
// effect immediately instead of on the next navigation.
export function refreshPrivacyOverlays() {
  for (const [serviceId, view] of serviceViews) {
    if (isPrivacyMode(serviceId)) applyPrivacyToView(view);
  }
}
