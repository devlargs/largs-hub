import type { WebContentsView } from "electron";
import type { Service } from "../store";
import {
  isGoogleMessagesHost,
  parsePhoneStatus,
  phoneStatusEqual,
  type PhoneStatus,
  type PhoneStatusReading,
} from "../shared/phoneStatus";
import { GOOGLE_MESSAGES_STATUS_SCRIPT } from "./scripts";
import { getDeps } from "./state";

// The paired phone's battery / connection status for Google Messages
// services, read from the page's banners (shared/phoneStatus.ts) and pushed to
// the sidebar and titlebar. Every other service is left alone.

const POLL_MS = 15_000;
const statuses = new Map<string, PhoneStatus>();

function send(serviceId: string, status: PhoneStatus | null) {
  getDeps()?.getUiView()?.webContents.send("phone-status-update", { serviceId, status });
}

function report(serviceId: string, status: PhoneStatus | null) {
  if (phoneStatusEqual(statuses.get(serviceId) ?? null, status)) return;
  if (status) statuses.set(serviceId, status);
  else statuses.delete(serviceId);
  send(serviceId, status);
}

/** Every known status, to seed the renderer after a reload. */
export function getPhoneStatuses(): Record<string, PhoneStatus> {
  return Object.fromEntries(statuses);
}

export function attachPhoneStatus(view: WebContentsView, service: Service, serviceHost: string) {
  if (!isGoogleMessagesHost(serviceHost)) return;
  const contents = view.webContents;

  const read = () => {
    if (contents.isDestroyed()) return;
    contents
      .executeJavaScript(GOOGLE_MESSAGES_STATUS_SCRIPT, true)
      .then((reading: PhoneStatusReading) => {
        if (!contents.isDestroyed()) report(service.id, parsePhoneStatus(reading));
      })
      .catch(() => {});
  };

  // Timers don't fire while the system sleeps, so no suspend handling is needed.
  const timer = setInterval(read, POLL_MS);
  contents.on("did-finish-load", read);
  contents.on("page-title-updated", read);
  contents.once("destroyed", () => {
    clearInterval(timer);
    report(service.id, null);
  });
}
