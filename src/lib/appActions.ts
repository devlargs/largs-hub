import type { Service } from "../types";
import { type AutomationPlatform, automationPlatformFor } from "@shared/automationPlatform";
import {
  isSwitchChord,
  switchTargetFor,
  type SwitchModifier,
  type SwitchTarget,
} from "@shared/shortcuts";

// Decisions the app shell makes about keys, context-menu requests and services, kept
// free of React so they can be unit-tested.

// Which automation panel a service gets, if any: the same check the main
// process's start handler makes (electron/messengerAutomation/index.ts).
export function automationPlatformOf(
  service: Service | null | undefined,
): AutomationPlatform | null {
  return service ? automationPlatformFor(service.url) : null;
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
  // Ctrl+1 (Cmd+1 on macOS) is Home, 2-9 the services in sidebar order
  | { kind: "switch"; target: SwitchTarget };

export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

// The shortcut a keydown in the interface stands for, if any. Zoom and find
// are Ctrl on both platforms; switching uses `switchModifier`, Cmd on macOS.
// Service views intercept the same keys in main.
export function appShortcutFor(
  e: ShortcutKey,
  switchModifier: SwitchModifier = "control",
): AppShortcut | null {
  const mods = { control: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey };
  if (isSwitchChord(mods, switchModifier)) {
    const target = switchTargetFor(e.key);
    if (target) return { kind: "switch", target };
  }
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  // Zoom tolerates shift ("+" is shift+"=" on most layouts).
  const direction = ZOOM_KEYS[e.key];
  if (direction) return { kind: "zoom", direction };
  if (e.shiftKey) return null;
  return e.key.toLowerCase() === "f" ? { kind: "find" } : null;
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
