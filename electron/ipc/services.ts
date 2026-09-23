import { ipcMain, BrowserWindow, WebContentsView } from "electron";
import { store, sanitizeService } from "../store";
import {
  destroyServiceView,
  showService,
  hideActiveService,
  getActiveServiceId,
} from "../serviceViews";
import { getNotificationCounts } from "../notificationCounts";
import { clearServiceSessionData } from "../partitions";
import { deleteCustomIconFile } from "../customIcons";
import { supersededIconFile } from "../iconCleanup";
import { stopAutomationForService } from "../messengerAutomation";
import { isFromApp } from "../appOrigin";
import { lastActiveServiceId, reorderServices, withAddedService } from "../serviceList";
import { toggleEnabled, toggleMute, toggleNotifications } from "./serviceToggles";
import { registerServiceNavigationIpc } from "./serviceNavigation";
import { registerServiceContextMenuIpc } from "./serviceContextMenu";

// IPC: service CRUD, per-service toggles (serviceToggles.ts) and which service
// is on screen. What happens inside a view is in serviceNavigation.ts, the
// native context menu in serviceContextMenu.ts; both register from here.

interface ServicesIpcDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
}

export function registerServicesIpc(deps: ServicesIpcDeps) {
  ipcMain.handle("get-services", () => {
    return store.get("services");
  });

  // Adding, changing and removing services (which loads URLs into logged-in
  // partitions and wipes session data) only answers the app's own page
  // (issue #112).
  ipcMain.handle("add-service", (event, rawService: unknown) => {
    const services = store.get("services");
    if (!isFromApp(event)) return services;
    const service = sanitizeService(rawService);
    if (!service) return services;
    const added = withAddedService(services, service);
    if (!added) return services;
    store.set("services", added);
    return added;
  });

  ipcMain.handle("remove-service", async (event, serviceId: string) => {
    if (!isFromApp(event)) return store.get("services");
    const removed = store.get("services").find((s) => s.id === serviceId);
    const services = store.get("services").filter((s) => s.id !== serviceId);
    store.set("services", services);

    // Take the uploaded icon with it, unless another service shares the file.
    const orphanedIcon = supersededIconFile(removed?.icon, null, services);
    if (orphanedIcon) deleteCustomIconFile(orphanedIcon);

    // End its automation now rather than when a task next runs, then clean up
    // the view.
    stopAutomationForService(serviceId);
    destroyServiceView(serviceId, { clearCounts: true });

    // Wipe the service's session partition. Removing a service means forgetting
    // the account, and the id is gone from the store, so its cookies, storage
    // and cache would otherwise be unreachable on disk forever.
    await clearServiceSessionData(serviceId);

    return services;
  });

  // Signs the account out and drops its cached data, keeping the service. Split
  // out of the context menu when the confirmation moved into the app (issue
  // #104): the prompt is the renderer's, the work stays here.
  ipcMain.handle("clear-service-data", async (event, serviceId: unknown) => {
    if (!isFromApp(event)) return;
    if (typeof serviceId !== "string" || !serviceId) return;
    if (!store.get("services").some((s) => s.id === serviceId)) return;
    const wasActive = getActiveServiceId() === serviceId;
    // Tear the view down first so nothing is holding the partition open,
    // then reopen it (blank) if it was the one on screen.
    destroyServiceView(serviceId, { clearCounts: true });
    await clearServiceSessionData(serviceId);
    if (wasActive) {
      deps
        .getUiView()
        ?.webContents.send("context-menu-action", { action: "show-service", serviceId });
    }
  });

  ipcMain.handle("update-service", (event, rawUpdated: unknown) => {
    if (!isFromApp(event)) return store.get("services");
    const updated = sanitizeService(rawUpdated);
    if (!updated) return store.get("services");
    const old = store.get("services").find((s) => s.id === updated.id);
    const services = store.get("services").map((s) => (s.id === updated.id ? updated : s));
    store.set("services", services);

    // If the URL changed, destroy the old view so it gets recreated with the new URL
    if (old && old.url !== updated.url) {
      destroyServiceView(updated.id);
    }

    // An icon that was replaced leaves its file behind otherwise (issue #70).
    const replacedIcon = supersededIconFile(
      old?.icon,
      updated.icon,
      services.filter((s) => s.id !== updated.id),
    );
    if (replacedIcon) deleteCustomIconFile(replacedIcon);

    return services;
  });

  ipcMain.handle("reorder-services", (_event, serviceIds: unknown) => {
    if (!Array.isArray(serviceIds) || !serviceIds.every((id) => typeof id === "string")) {
      return store.get("services");
    }
    const reordered = reorderServices(store.get("services"), serviceIds);
    store.set("services", reordered);
    return reordered;
  });

  ipcMain.handle("toggle-mute-service", (_event, serviceId: string) => {
    return toggleMute(serviceId) ?? store.get("services");
  });

  ipcMain.handle("toggle-service-enabled", (_event, serviceId: string) => {
    return toggleEnabled(serviceId) ?? store.get("services");
  });

  ipcMain.handle("toggle-service-notifications", (_event, serviceId: string) => {
    return toggleNotifications(serviceId) ?? store.get("services");
  });

  ipcMain.on("show-service", (_event, serviceId: string) => {
    showService(serviceId);
    store.set("lastActiveServiceId", serviceId);
  });

  ipcMain.handle("get-notification-counts", (): Record<string, number> => getNotificationCounts());

  // The service to reopen on launch. Resolved here rather than in the renderer
  // so a stale id (service removed or disabled since) never reaches the UI.
  ipcMain.handle("get-last-active-service", (): string | null =>
    lastActiveServiceId(store.get("lastActiveServiceId"), store.get("services")),
  );

  ipcMain.handle("hide-service", () => {
    hideActiveService();
  });

  registerServiceNavigationIpc();
  registerServiceContextMenuIpc(deps);
}
