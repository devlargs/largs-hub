import { useEffect, useState } from "react";
import type { Service } from "../types";
import { automationPlatformOf } from "../lib/appActions";

// Whether the automation panel is open, and whether it can be: it only applies
// to a Messenger or WhatsApp service (`platform` says which).
export function useAutomationPanel(activeService: Service | null) {
  const [open, setOpen] = useState(false);

  // Split the layout into a service pane (left) and the automation panel
  // (right) by resizing the Messenger view instead of hiding it, so the
  // conversation stays visible beside the panel.
  useEffect(() => {
    if (!open) return;
    window.electronAPI?.messengerAutomation.setSplitOpen(true);
    return () => {
      window.electronAPI?.messengerAutomation.setSplitOpen(false);
    };
  }, [open]);

  // Close the panel when navigating away from an automatable service
  const platform = automationPlatformOf(activeService);
  const available = platform !== null;
  useEffect(() => {
    if (open && !available) setOpen(false);
  }, [open, available]);

  return { open, setOpen, available, platform };
}
