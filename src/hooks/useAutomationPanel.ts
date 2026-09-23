import { useEffect, useState } from "react";
import type { Service } from "../types";
import { isMessengerService } from "../lib/appActions";

// Whether the Messenger automation panel is open, and whether it can be: it
// only applies to a Messenger service.
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

  // Close the panel when navigating away from a Messenger service
  const available = isMessengerService(activeService);
  useEffect(() => {
    if (open && !available) setOpen(false);
  }, [open, available]);

  return { open, setOpen, available };
}
