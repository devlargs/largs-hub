import { WebContentsView } from "electron";
import { hasAutomationForService } from "../messengerAutomation";
import { serviceViews } from "./state";

// Chromium throttles timers in hidden pages, harder the longer they stay
// hidden. Every service view but the active one is hidden, and while the
// workspace is locked the active one is too, so a view running automation
// opts out: its injected scripts (the send loops, the WhatsApp call menu, the
// call watch) then keep their pace behind the lock and in the background.
// Views without automation stay throttled to save power.

export function applyAutomationThrottling(view: WebContentsView, serviceId: string) {
  if (view.webContents.isDestroyed()) return;
  view.webContents.setBackgroundThrottling(!hasAutomationForService(serviceId));
}

/** Re-apply for every live view, after the automation task list changed. */
export function refreshAutomationThrottling() {
  for (const [serviceId, view] of serviceViews) applyAutomationThrottling(view, serviceId);
}
