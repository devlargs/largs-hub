import { ipcMain, Menu, BrowserWindow, WebContentsView } from "electron";
import { store, Service, sanitizeService } from "../store";
import { isTasksService } from "../shared/types";
import {
  getServiceView,
  destroyServiceView,
  showService,
  hideActiveService,
  getActiveServiceId,
  setFindBarOpen,
  findInService,
  stopFindInService,
  getServiceZoom,
  setServiceZoom,
  stepServiceZoom,
  getAutomationPanelWidth,
} from "../serviceViews";
import { getNotificationCounts } from "../notificationCounts";
import { clearServiceSessionData } from "../partitions";
import { deleteCustomIconFile } from "../customIcons";
import { supersededIconFile } from "../iconCleanup";
import { hasAutomationForService, stopAutomationForService } from "../messengerAutomation";
import { enableToggleNeedsConfirm } from "../serviceFlags";
import { isFromApp } from "../appOrigin";
import {
  serviceFlagMenuItems,
  toggleEnabled,
  toggleMute,
  toggleNotifications,
} from "./serviceToggles";

// IPC: service CRUD, per-service toggles (serviceToggles.ts), view navigation,
// and the native service context menu.

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
    if (services.some((s) => s.id === service.id)) return services;
    services.push(service);
    store.set("services", services);
    return services;
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
    const services = store.get("services");
    const reordered = serviceIds
      .map((id) => services.find((s) => s.id === id))
      .filter(Boolean) as Service[];
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

  // The service to reopen on launch. Resolved here rather than in the renderer
  // so a stale id (service removed or disabled since) never reaches the UI.
  ipcMain.handle("get-notification-counts", (): Record<string, number> => getNotificationCounts());

  ipcMain.handle("get-last-active-service", (): string | null => {
    const serviceId = store.get("lastActiveServiceId");
    if (typeof serviceId !== "string") return null;
    const service = store.get("services").find((s) => s.id === serviceId);
    return service && service.enabled !== false ? service.id : null;
  });

  ipcMain.handle("hide-service", () => {
    hideActiveService();
  });

  ipcMain.on("reload-service", (_event, serviceId: string) => {
    const view = getServiceView(serviceId);
    if (view) {
      view.webContents.reload();
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

  // Native context menu for services — always renders on top of WebContentsViews
  ipcMain.on("show-service-context-menu", (_event, serviceId: string) => {
    const mainWindow = deps.getMainWindow();
    const uiView = deps.getUiView();
    const services = store.get("services");
    const service = services.find((s) => s.id === serviceId);
    if (!service || !mainWindow || !uiView) return;

    const sendUpdated = () => {
      const updated = store.get("services");
      deps.getUiView()?.webContents.send("services-updated", updated);
    };

    const menu = Menu.buildFromTemplate([
      { label: service.name, enabled: false },
      { type: "separator" },
      {
        label: "Enabled",
        type: "checkbox",
        checked: service.enabled !== false,
        click: () => {
          // Disabling ends the service's Messenger automation, so with any
          // running the renderer asks first and calls toggleServiceEnabled on
          // confirm. Reads the service now, not the copy the menu opened with.
          const current = store.get("services").find((s) => s.id === serviceId);
          if (current && enableToggleNeedsConfirm(current, hasAutomationForService(serviceId))) {
            deps.getUiView()?.webContents.send("context-menu-action", {
              action: "confirm-disable-service",
              serviceId,
            });
            return;
          }
          const updated = toggleEnabled(serviceId);
          if (!updated) return;
          sendUpdated();
          // If re-enabling, bring the service back on screen.
          if (updated.find((s) => s.id === serviceId)?.enabled !== false) {
            deps.getUiView()?.webContents.send("context-menu-action", {
              action: "show-service",
              serviceId,
            });
          }
        },
      },
      // None of these mean anything for the Todo service (see isTasksService)
      ...(isTasksService(service) ? [] : serviceFlagMenuItems(service, sendUpdated)),
      { type: "separator" },
      {
        label: "Edit service",
        click: () => {
          deps
            .getUiView()
            ?.webContents.send("context-menu-action", { action: "edit-service", serviceId });
        },
      },
      {
        label: "Reload",
        click: () => {
          const view = getServiceView(serviceId);
          if (view) view.webContents.reload();
        },
      },
      {
        // Both destructive items ask the renderer to confirm rather than
        // opening a native message box, so the prompt looks like the rest of
        // the app (issue #104). The work itself still happens in main.
        label: "Clear data and sign out",
        click: () => {
          deps
            .getUiView()
            ?.webContents.send("context-menu-action", { action: "confirm-clear-data", serviceId });
        },
      },
      { type: "separator" },
      {
        label: "Remove service",
        click: () => {
          deps.getUiView()?.webContents.send("context-menu-action", {
            action: "confirm-remove-service",
            serviceId,
          });
        },
      },
    ]);

    menu.popup({ window: mainWindow });
  });
}
