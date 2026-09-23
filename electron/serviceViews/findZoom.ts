import { store } from "../store";
import { DEFAULT_ZOOM, nextZoom, sanitizeZoom } from "../zoom";
import { getDeps, serviceViews } from "./state";

// Find in page and per-service zoom. The find bar itself is React; its strip in
// the layout is reserved by setFindBarOpen (layout.ts).

// --- Find in page ------------------------------------------------------------

export function findInService(
  serviceId: string,
  text: string,
  forward: boolean,
  findNext: boolean,
) {
  const view = serviceViews.get(serviceId);
  if (!view || view.webContents.isDestroyed()) return;
  if (!text) {
    view.webContents.stopFindInPage("clearSelection");
    getDeps()
      ?.getUiView()
      ?.webContents.send("find-results", { serviceId, matches: 0, activeMatchOrdinal: 0 });
    return;
  }
  view.webContents.findInPage(text, { forward, findNext });
}

// Ask the UI to show the find bar for a service and hand it keyboard focus.
// React owns whether the bar is open; main only reserves its strip once the
// renderer confirms with set-find-bar-open.
export function openFindBarFor(serviceId: string) {
  const uiView = getDeps()?.getUiView();
  if (!uiView) return;
  uiView.webContents.send("open-find-bar", serviceId);
  uiView.webContents.focus();
}

export function stopFindInService(serviceId: string) {
  const view = serviceViews.get(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.stopFindInPage("clearSelection");
  }
}

// --- Zoom --------------------------------------------------------------------

// Ctrl+<key> zoom shortcuts. "Add"/"Subtract" are the numpad keys.
export const ZOOM_KEYS: Record<string, "in" | "out" | "reset"> = {
  "=": "in",
  "+": "in",
  Add: "in",
  "-": "out",
  _: "out",
  Subtract: "out",
  "0": "reset",
};

export function getServiceZoom(serviceId: string): number {
  return sanitizeZoom(store.get("serviceZoom")[serviceId]);
}

// Persist the factor and apply it to the live view. Stored per service so it
// survives hibernation, a reload, and a restart.
export function setServiceZoom(serviceId: string, factor: number) {
  const zoom = sanitizeZoom(factor);
  const all = { ...store.get("serviceZoom") };
  if (zoom === DEFAULT_ZOOM) delete all[serviceId];
  else all[serviceId] = zoom;
  store.set("serviceZoom", all);

  const view = serviceViews.get(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.setZoomFactor(zoom);
  }
  getDeps()?.getUiView()?.webContents.send("service-zoom-changed", { serviceId, factor: zoom });
}

export function stepServiceZoom(serviceId: string, direction: "in" | "out" | "reset") {
  const factor =
    direction === "reset" ? DEFAULT_ZOOM : nextZoom(getServiceZoom(serviceId), direction);
  setServiceZoom(serviceId, factor);
}
