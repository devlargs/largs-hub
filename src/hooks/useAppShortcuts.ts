import { useEffect, useRef } from "react";
import { appShortcutFor } from "../lib/appActions";
import { switchModifierFor, type SwitchTarget } from "@shared/shortcuts";

const SWITCH_MODIFIER = switchModifierFor(window.electronAPI?.platform ?? "");

interface AppShortcutOptions {
  locked: boolean;
  activeServiceId: string | null;
  onFind: (serviceId: string) => void;
  // Home, or the zero-based sidebar position of the service to switch to
  onSwitch: (target: SwitchTarget) => void;
}

// Shortcuts while the interface (not a service view) has focus: Ctrl zoom,
// Ctrl find in page and Ctrl+1-9 (Cmd+1-9 on macOS; 1 is Home). Service views
// handle the same keys in main.
export function useAppShortcuts(options: AppShortcutOptions): void {
  // Read inside the window-level key handler, which is registered once and
  // must not re-bind on every service switch.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const { locked, activeServiceId, onFind, onSwitch } = latest.current;
      // Nothing behind the lock screen is reachable, shortcuts included.
      if (locked) return;
      const shortcut = appShortcutFor(e, SWITCH_MODIFIER);
      if (!shortcut) return;
      switch (shortcut.kind) {
        case "zoom":
          if (!activeServiceId) return;
          e.preventDefault();
          window.electronAPI?.stepServiceZoom(activeServiceId, shortcut.direction);
          return;
        case "find":
          if (!activeServiceId) return;
          e.preventDefault();
          onFind(activeServiceId);
          return;
        case "switch":
          e.preventDefault();
          onSwitch(shortcut.target);
          return;
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);
}
