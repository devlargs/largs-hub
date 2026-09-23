import { isInternalService, type Service } from "./shared/types";
import { isDeviceAllowed } from "./servicePermissions";

// The pure half of a per-service flag toggle: given the current list, produce
// the next one with a patch merged into a single service.
//
// Kept out of ipc/services.ts so it can be unit-tested without an Electron
// runtime — that module reaches for the store and live WebContentsViews.

/**
 * Merge `patch(service)` into the matching service, leaving every other entry
 * untouched. Returns null when the id isn't in the list, which callers use to
 * do nothing rather than write a list back unchanged (a native context menu can
 * sit open while the service it names is removed).
 */
export function applyServicePatch(
  services: Service[],
  serviceId: string,
  patch: (service: Service) => Partial<Service>,
): Service[] | null {
  const current = services.find((s) => s.id === serviceId);
  if (!current) return null;
  return services.map((s) => (s.id === serviceId ? { ...s, ...patch(current) } : s));
}

// The flag toggles themselves. Each reads the *current* service rather than a
// captured copy, so a stale menu can't flip a value based on what it showed
// when it opened.

export const nextEnabled = (s: Service): Partial<Service> => ({ enabled: s.enabled === false });

/**
 * Whether flipping `enabled` needs the user to confirm first: only when it
 * would disable a service that has Messenger automation, since disabling ends
 * all of it. Enabling, or disabling a service with nothing running, just
 * happens.
 */
/**
 * Whether switching to this service shows a web view. Internal services and
 * disabled ones are React pages in the UI view instead, so switching to them
 * hides the current view and hands the keyboard to the UI.
 */
export const showsWebView = (s: Service | undefined): s is Service =>
  !!s && !isInternalService(s) && s.enabled !== false;

export const enableToggleNeedsConfirm = (s: Service, hasAutomation: boolean): boolean =>
  s.enabled !== false && hasAutomation;

export const nextMuted = (s: Service): Partial<Service> => ({ muted: !s.muted });

export const nextNotificationsEnabled = (s: Service): Partial<Service> => ({
  notificationsEnabled: s.notificationsEnabled === false,
});

export const nextBlurWhenInactive = (s: Service): Partial<Service> => ({
  blurWhenInactive: !s.blurWhenInactive,
});

export const nextPrivacyMode = (s: Service): Partial<Service> => ({ privacyMode: !s.privacyMode });

// Flip what the switch currently shows, which for an unset flag is the
// service's default (isDeviceAllowed), and store it explicitly from then on.
export const nextCameraAllowed = (s: Service): Partial<Service> => ({
  cameraAllowed: !isDeviceAllowed(s, "camera"),
});

export const nextMicrophoneAllowed = (s: Service): Partial<Service> => ({
  microphoneAllowed: !isDeviceAllowed(s, "microphone"),
});
