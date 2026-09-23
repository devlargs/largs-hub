import { ipcMain } from "electron";
import {
  getServiceView,
  setFindBarOpen,
  findInService,
  stopFindInService,
  getServiceZoom,
  setServiceZoom,
  stepServiceZoom,
  getAutomationPanelWidth,
} from "../serviceViews";

// IPC for what happens inside a service view: reload, back/forward, find in
// page and zoom, plus the width reserved for the automation panel beside it.
export function registerServiceNavigationIpc() {
  ipcMain.on("reload-service", (_event, serviceId: string) => {
    const view = getServiceView(serviceId);
    if (view) {
      view.webContents.reload();
    }
  });

  ipcMain.on("go-back", (_event, serviceId: string) => {
    const view = getServiceView(serviceId);
    if (view && view.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  });

  ipcMain.on("go-forward", (_event, serviceId: string) => {
    const view = getServiceView(serviceId);
    if (view && view.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  });

  // --- Find in page ----------------------------------------------------------
  // The renderer owns whether the bar is open; main reserves its strip and
  // drives webContents.findInPage.

  ipcMain.on("set-find-bar-open", (_event, open: unknown) => {
    setFindBarOpen(open === true);
  });

  ipcMain.on(
    "find-in-page",
    (
      _event,
      payload: { serviceId?: unknown; text?: unknown; forward?: unknown; findNext?: unknown },
    ) => {
      if (typeof payload?.serviceId !== "string" || typeof payload?.text !== "string") return;
      findInService(
        payload.serviceId,
        payload.text,
        payload.forward !== false,
        payload.findNext === true,
      );
    },
  );

  ipcMain.on("stop-find-in-page", (_event, serviceId: string) => {
    if (typeof serviceId === "string") stopFindInService(serviceId);
  });

  // The width main reserved for the Messenger automation panel, read once on
  // mount; later changes arrive on the automation-split-width event.
  ipcMain.handle("get-automation-split-width", (): number => getAutomationPanelWidth());

  // --- Zoom ------------------------------------------------------------------

  ipcMain.handle("get-service-zoom", (_event, serviceId: unknown): number =>
    typeof serviceId === "string" ? getServiceZoom(serviceId) : 1,
  );

  ipcMain.on("set-service-zoom", (_event, payload: { serviceId?: unknown; factor?: unknown }) => {
    if (typeof payload?.serviceId !== "string" || typeof payload?.factor !== "number") return;
    setServiceZoom(payload.serviceId, payload.factor);
  });

  ipcMain.on(
    "step-service-zoom",
    (_event, payload: { serviceId?: unknown; direction?: unknown }) => {
      if (typeof payload?.serviceId !== "string") return;
      const { direction } = payload;
      if (direction !== "in" && direction !== "out" && direction !== "reset") return;
      stepServiceZoom(payload.serviceId, direction);
    },
  );
}
