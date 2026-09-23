import type { Service } from "../types";

// Decisions the app shell makes about keys, context-menu requests and services, kept
// free of React so they can be unit-tested.

// Mirrors the main process's hostname-based Messenger detection
// (electron/messengerAutomation/index.ts)
export function isMessengerService(service: Service | null | undefined): boolean {
  if (!service) return false;
  try {
    return new URL(service.url).hostname.includes("messenger");
  } catch {
    return false;
  }
}

export type ZoomDirection = "in" | "out" | "reset";

// Ctrl+<key> zoom shortcuts, mirroring ZOOM_KEYS in electron/serviceViews so
// the shortcut behaves the same whether the interface or a service has focus.
const ZOOM_KEYS: Record<string, ZoomDirection> = {
  "=": "in",
  "+": "in",
  "-": "out",
  _: "out",
  "0": "reset",
};

export type AppShortcut =
  | { kind: "zoom"; direction: ZoomDirection }
  | { kind: "find" }
  // Zero-based position in the sidebar, disabled services included
  | { kind: "switch"; index: number };

export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

// The Ctrl shortcut a keydown in the interface stands for, if any. Ctrl on
// both platforms: service views intercept the same Ctrl keys in main.
export function appShortcutFor(e: ShortcutKey): AppShortcut | null {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  // Zoom tolerates shift ("+" is shift+"=" on most layouts).
  const direction = ZOOM_KEYS[e.key];
  if (direction) return { kind: "zoom", direction };
  if (e.shiftKey) return null;
  if (e.key.toLowerCase() === "f") return { kind: "find" };
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) return { kind: "switch", index: num - 1 };
  return null;
}

// The context-menu actions that ask before doing something destructive
// (issue #104). Main no longer opens a native message box; it sends the
// request to the renderer. All of them are danger-toned.
export interface ConfirmPrompt {
  title: string;
  body: string;
  confirmLabel: string;
}

export function confirmPromptFor(action: string, serviceName: string): ConfirmPrompt | null {
  switch (action) {
    case "confirm-remove-service":
      return {
        title: `Remove ${serviceName}?`,
        body: "This permanently removes the service from Largs Hub, along with its saved sign-in.",
        confirmLabel: "Remove",
      };
    case "confirm-disable-service":
      return {
        title: `Disable ${serviceName}?`,
        body: "Disabling this service stops all of its Messenger automation: scheduled and interval messages, emoji bursts, call cycles and the auto-stop timer. You can enable the service again later, but the automation won't restart.",
        confirmLabel: "Disable",
      };
    case "confirm-clear-data":
      return {
        title: `Clear ${serviceName}'s data?`,
        body: "This signs the account out and deletes the service's cookies, site data and cache. The service itself is kept.",
        confirmLabel: "Clear data",
      };
    default:
      return null;
  }
}
