import { useEffect, useRef } from "react";
import { appShortcutFor } from "../lib/appActions";

interface AppShortcutOptions {
  locked: boolean;
  activeServiceId: string | null;
  onFind: (serviceId: string) => void;
  // Zero-based sidebar position of the service to switch to
  onSwitch: (index: number) => void;
}

// Ctrl shortcuts while the interface (not a service view) has focus: zoom,
// find in page and Ctrl+1-9. Service views handle the same keys in main.
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
      const shortcut = appShortcutFor(e);
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
          onSwitch(shortcut.index);
          return;
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);
}
