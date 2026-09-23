import type { Service } from "./shared/types";
import { isSameDomain, normalizeHost } from "./navigationPolicy";

// Which browser permissions a service's page may have. Deny by default:
// without a handler Electron grants whatever a page asks for (camera, mic,
// geolocation, clipboard, ...).
//
// Kept out of serviceViews/ so it can be unit-tested without Electron.

// Services with calls in the browser, and the domains their calls run on. A
// service whose host falls under one of these gets camera and mic by default
// (its Camera and Microphone switches start on), and any of the preset's
// domains may ask for them — Messenger calls are served from facebook.com as
// well as messenger.com, Gmail's calls from meet.google.com.
const CALL_PRESETS: readonly (readonly string[])[] = [
  ["messenger.com", "facebook.com"],
  ["whatsapp.com"],
  ["slack.com"],
  ["discord.com"],
  ["telegram.org"],
  ["mail.google.com", "chat.google.com", "meet.google.com"],
];

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function callPresetFor(serviceHost: string): readonly string[] | undefined {
  if (!serviceHost) return undefined;
  return CALL_PRESETS.find((domains) => domains.some((d) => isSameDomain(serviceHost, d)));
}

export type MediaDevice = "camera" | "microphone";

/**
 * Whether the service's Camera or Microphone switch is on. Unset means the
 * default: on for the call services above, off for everything else, including
 * custom services (issue #114). The two used to be one "Camera & microphone"
 * switch; a service that set it has both flags seeded from it on load
 * (serviceSchema.ts).
 */
export function isDeviceAllowed(
  service: Pick<Service, "url" | "cameraAllowed" | "microphoneAllowed">,
  device: MediaDevice,
): boolean {
  const flag = device === "camera" ? service.cameraAllowed : service.microphoneAllowed;
  if (typeof flag === "boolean") return flag;
  return callPresetFor(hostOf(service.url)) !== undefined;
}

// Chromium names the devices by media type: "video" is the camera, "audio"
// the microphone. Anything else ("unknown", or no type at all, as when a page
// only lists its devices) needs at least one of the two switched on.
function mediaTypesAllowed(service: Service, mediaTypes: readonly string[]): boolean {
  const known = mediaTypes.filter((t) => t === "video" || t === "audio");
  if (known.length === 0) {
    return isDeviceAllowed(service, "camera") || isDeviceAllowed(service, "microphone");
  }
  return known.every((t) => isDeviceAllowed(service, t === "video" ? "camera" : "microphone"));
}

/**
 * Whether a page at `requestingUrl` counts as the service itself, for camera
 * and mic. Only the service's own domain (either direction, like
 * shouldKeepInView) and its preset's call domains qualify. The auth/CDN
 * domains a service view may also show, and third-party iframes inside it,
 * don't: they'd otherwise inherit the service's grant without a prompt.
 */
export function isServiceOrigin(serviceUrl: string, requestingUrl: string): boolean {
  const serviceHost = hostOf(serviceUrl);
  const host = hostOf(requestingUrl);
  if (!serviceHost || !host) return false;
  if (isSameDomain(host, serviceHost) || isSameDomain(serviceHost, host)) return true;
  return callPresetFor(serviceHost)?.some((d) => isSameDomain(host, d)) ?? false;
}

/**
 * Whether `service` may use `permission` for a page at `requestingUrl` (the
 * requesting frame's URL or origin). Notifications follow the service's
 * Notifications toggle: turned off, the page is refused the permission, so
 * Chromium drops its notifications instead of showing them natively. Camera
 * and mic each need their own switch on and a request from the service itself.
 * `mediaTypes` are the devices a "media" request is for: Electron's
 * `mediaTypes` on a request, or its single `mediaType` on a check.
 */
export function isPermissionAllowed(
  service: Service | undefined,
  permission: string,
  requestingUrl: string,
  mediaTypes: readonly string[] = [],
): boolean {
  if (!service) return false;
  switch (permission) {
    case "notifications":
      return service.notificationsEnabled !== false;
    case "fullscreen":
    case "clipboard-sanitized-write":
      return true;
    case "media":
      return mediaTypesAllowed(service, mediaTypes) && isServiceOrigin(service.url, requestingUrl);
    default:
      return false;
  }
}
