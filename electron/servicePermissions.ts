import type { Service } from "./shared/types";

// Which browser permissions a service's page may have. Deny by default:
// without a handler Electron grants whatever a page asks for (camera, mic,
// geolocation, clipboard, ...).
//
// Kept out of serviceViews.ts so it can be unit-tested without Electron.

// Messenger / WhatsApp need camera+mic for calls
const CALL_HOSTS = /(^|\.)messenger\.com$|(^|\.)facebook\.com$|(^|\.)whatsapp\.com$/;

/**
 * Whether `service` may use `permission`. Notifications follow the service's
 * Notifications toggle: turned off, the page is refused the permission, so
 * Chromium drops its notifications instead of showing them natively.
 */
export function isPermissionAllowed(service: Service | undefined, permission: string): boolean {
  if (!service) return false;
  switch (permission) {
    case "notifications":
      return service.notificationsEnabled !== false;
    case "fullscreen":
    case "clipboard-sanitized-write":
      return true;
    case "media":
      try {
        return CALL_HOSTS.test(new URL(service.url).hostname);
      } catch {
        return false; // invalid URL — keep the restrictive default
      }
    default:
      return false;
  }
}
