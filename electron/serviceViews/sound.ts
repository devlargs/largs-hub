import { WebContentsView } from "electron";
import { store } from "../store";
import { isSoundSilenced } from "../serviceFlags";
import { quietNotificationsScript } from "../quietNotifications";
import { serviceViews, viewState } from "./state";

// Whether a service view may make sound: not while its Sound switch is off,
// and not while the workspace is locked (views are suppressed exactly then).
// Silencing covers both the page's own audio (Messenger's chime, a ringing
// call) and the sound the OS plays with a native notification. Call windows
// are left alone, so a call already in progress keeps its audio.

export function isServiceSilenced(serviceId: string): boolean {
  const service = store.get("services").find((s) => s.id === serviceId);
  return isSoundSilenced(service, viewState.viewsSuppressed);
}

export function applyServiceSound(view: WebContentsView, serviceId: string) {
  if (view.webContents.isDestroyed()) return;
  const silent = isServiceSilenced(serviceId);
  view.webContents.setAudioMuted(silent);
  // The notification half re-runs per document, without a reload
  view.webContents.executeJavaScript(quietNotificationsScript(silent), true).catch(() => {});
}

/** Re-apply every live view's sound, after the workspace locks or unlocks. */
export function applySoundToAllViews() {
  for (const [serviceId, view] of serviceViews) applyServiceSound(view, serviceId);
}
