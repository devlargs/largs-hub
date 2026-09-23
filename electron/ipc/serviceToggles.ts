import { store, Service } from "../store";
import {
  getServiceView,
  destroyServiceView,
  isWindowFocused,
  applyBlurToView,
  removeBlurFromView,
  applyPrivacyToView,
  removePrivacyFromView,
} from "../serviceViews";
import { quietNotificationsScript } from "../quietNotifications";
import { stopAutomationForService } from "../messengerAutomation";
import { isMediaAllowed } from "../servicePermissions";
import {
  applyServicePatch,
  nextBlurWhenInactive,
  nextEnabled,
  nextMediaAllowed,
  nextMuted,
  nextNotificationsEnabled,
  nextPrivacyMode,
} from "../serviceFlags";

// --- Per-service flag toggles ------------------------------------------------
// Every per-service flag (enabled, muted, notifications, blur, privacy, camera
// & mic) used to be written out twice — once as an IPC handler, once as a
// context-menu item — with near-identical copies of the same map/set/push, and
// the two copies had already drifted (issue #83). Each toggle here pairs the
// store patch with its live-view side effect, and both the IPC handlers and the
// native context menu (services.ts) call these, so the two paths can't drift.
//
// The store is re-read inside the patch rather than closed over: a native menu
// can sit open while the state underneath it changes, so a captured `service`
// goes stale. Every toggle returns the updated list, or null if the service is
// gone.

export function patchService(
  serviceId: string,
  patch: (service: Service) => Partial<Service>,
): Service[] | null {
  const updated = applyServicePatch(store.get("services"), serviceId, patch);
  if (!updated) return null;
  store.set("services", updated);
  return updated;
}

export function toggleEnabled(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextEnabled);
  if (!updated) return null;
  // Disabling frees the view (and its badge) and ends the service's Messenger
  // automation; enabling just lets the view be recreated.
  if (updated.find((s) => s.id === serviceId)?.enabled === false) {
    stopAutomationForService(serviceId);
    destroyServiceView(serviceId, { clearCounts: true });
  }
  return updated;
}

export function toggleMute(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextMuted);
  if (!updated) return null;
  const view = getServiceView(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    const muted = updated.find((s) => s.id === serviceId)?.muted === true;
    view.webContents.setAudioMuted(muted);
    // And the OS sound that comes with its notifications, without a reload
    view.webContents.executeJavaScript(quietNotificationsScript(muted), true).catch(() => {});
  }
  return updated;
}

export function toggleNotifications(serviceId: string): Service[] | null {
  // No live-view side effect: the flag is read when a count is reported.
  return patchService(serviceId, nextNotificationsEnabled);
}

function toggleBlurWhenInactive(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextBlurWhenInactive);
  if (!updated) return null;
  // Only visible right now if the window is already unfocused.
  if (!isWindowFocused()) {
    const view = getServiceView(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      if (updated.find((s) => s.id === serviceId)?.blurWhenInactive) applyBlurToView(view);
      else removeBlurFromView(view);
    }
  }
  return updated;
}

function togglePrivacyMode(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextPrivacyMode);
  if (!updated) return null;
  const view = getServiceView(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    if (updated.find((s) => s.id === serviceId)?.privacyMode) applyPrivacyToView(view);
    else removePrivacyFromView(view);
  }
  return updated;
}

function toggleMediaAllowed(serviceId: string): Service[] | null {
  // No live-view side effect: the session's permission handlers read the
  // flag on every request. A call already running keeps its devices until
  // it ends; the next one is refused.
  return patchService(serviceId, nextMediaAllowed);
}

/**
 * The service's switch items for its native context menu: Sound,
 * Notifications, Blur when inactive, Privacy mode and Camera & microphone.
 * `onChange` runs after a switch actually flipped, to push the new list to
 * the renderer.
 */
export function serviceFlagMenuItems(
  service: Service,
  onChange: () => void,
): Electron.MenuItemConstructorOptions[] {
  const item = (
    label: string,
    checked: boolean,
    toggle: (serviceId: string) => Service[] | null,
  ): Electron.MenuItemConstructorOptions => ({
    label,
    type: "checkbox",
    checked,
    click: () => {
      if (toggle(service.id)) onChange();
    },
  });
  return [
    item("Sound", !service.muted, toggleMute),
    item("Notifications", service.notificationsEnabled !== false, toggleNotifications),
    item("Blur when inactive", service.blurWhenInactive === true, toggleBlurWhenInactive),
    item("Privacy mode", service.privacyMode === true, togglePrivacyMode),
    item("Camera & microphone", isMediaAllowed(service), toggleMediaAllowed),
  ];
}
