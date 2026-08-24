import { ipcMain, dialog, Menu, BrowserWindow, WebContentsView } from "electron";
import { store, Service, sanitizeService } from "../store";
import {
  getServiceView,
  destroyServiceView,
  showService,
  hideActiveService,
  isWindowFocused,
  getActiveServiceId,
  applyBlurToView,
  removeBlurFromView,
  applyPrivacyToView,
  removePrivacyFromView,
  setFindBarOpen,
  findInService,
  stopFindInService,
  getServiceZoom,
  setServiceZoom,
  stepServiceZoom,
  getAutomationPanelWidth,
} from "../serviceViews";
import { getNotificationCounts } from "../notificationCounts";
import { forgetPomodoroService } from "../tasks";
import { stopTimerForService } from "../pomodoroTimer";
import { clearServiceSessionData } from "../partitions";
import { deleteCustomIconFile } from "../customIcons";
import { supersededIconFile } from "../iconCleanup";
import {
  applyServicePatch,
  nextBlurWhenInactive,
  nextEnabled,
  nextMuted,
  nextNotificationsEnabled,
  nextPrivacyMode,
} from "../serviceFlags";

// IPC: service CRUD, per-service toggles, view navigation, and the native
// service context menu.

interface ServicesIpcDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
}

// --- Per-service flag toggles ------------------------------------------------
// Every per-service flag (enabled, muted, notifications, blur, privacy) used to
// be written out twice — once as an IPC handler, once as a context-menu item —
// with five near-identical copies of the same map/set/push, and the two copies
// had already drifted (issue #83).
//
// The store is re-read inside the patch rather than closed over: a native menu
// can sit open while the state underneath it changes, so a captured `service`
// goes stale. Returns the updated list, or null if the service is gone.
function patchService(
  serviceId: string,
  patch: (service: Service) => Partial<Service>,
): Service[] | null {
  const updated = applyServicePatch(store.get("services"), serviceId, patch);
  if (!updated) return null;
  store.set("services", updated);
  return updated;
}

// The five per-service toggles, each pairing the store patch with its live-view
// side effect. Both the IPC handlers and the native context menu call these, so
// the two paths can't drift again.

function toggleEnabled(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextEnabled);
  if (!updated) return null;
  // Disabling frees the view (and its badge); enabling just lets it be recreated.
  if (updated.find((s) => s.id === serviceId)?.enabled === false) {
    destroyServiceView(serviceId, { clearCounts: true });
  }
  return updated;
}

function toggleMute(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextMuted);
  if (!updated) return null;
  const view = getServiceView(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.setAudioMuted(updated.find((s) => s.id === serviceId)?.muted === true);
  }
  return updated;
}

function toggleNotifications(serviceId: string): Service[] | null {
  // No live-view side effect: the flag is read when a count is reported.
  return patchService(serviceId, nextNotificationsEnabled);
}

function toggleBlurWhenInactive(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextBlurWhenInactive);
  if (!updated) return null;
  // Only visible right now if the window is already unfocused.
  if (!isWindowFocused()) {
    const view = getServiceView(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      if (updated.find((s) => s.id === serviceId)?.blurWhenInactive) applyBlurToView(view);
      else removeBlurFromView(view);
    }
  }
  return updated;
}

function togglePrivacyMode(serviceId: string): Service[] | null {
  const updated = patchService(serviceId, nextPrivacyMode);
  if (!updated) return null;
  const view = getServiceView(serviceId);
  if (view && !view.webContents.isDestroyed()) {
    if (updated.find((s) => s.id === serviceId)?.privacyMode) applyPrivacyToView(view);
    else removePrivacyFromView(view);
  }
  return updated;
}

export function registerServicesIpc(deps: ServicesIpcDeps) {
  ipcMain.handle("get-services", () => {
    return store.get("services");
  });

  ipcMain.handle("add-service", (_event, rawService: unknown) => {
    const services = store.get("services");
    const service = sanitizeService(rawService);
    if (!service) return services;
    if (services.some((s) => s.id === service.id)) return services;
    services.push(service);
    store.set("services", services);
    return services;
  });

  ipcMain.handle("remove-service", async (_event, serviceId: string) => {
    const removed = store.get("services").find((s) => s.id === serviceId);
    const services = store.get("services").filter((s) => s.id !== serviceId);
    store.set("services", services);

    // Take the uploaded icon with it, unless another service shares the file.
    const orphanedIcon = supersededIconFile(removed?.icon, null, services);
    if (orphanedIcon) deleteCustomIconFile(orphanedIcon);

    // Clean up the view
    destroyServiceView(serviceId, { clearCounts: true });

    // Wipe the service's session partition. Removing a service means forgetting
    // the account, and the id is gone from the store, so its cookies, storage
    // and cache would otherwise be unreachable on disk forever.
    await clearServiceSessionData(serviceId);

    // Drop the Pomodoro service's tasks, queue, and Notion credentials, and
    // stop any focus timer bound to it
    forgetPomodoroService(store, serviceId);
    stopTimerForService(serviceId);

    return services;
  });

  ipcMain.handle("update-service", (_event, rawUpdated: unknown) => {
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
    return (
      patchService(serviceId, (s) => ({
        notificationsEnabled: s.notificationsEnabled === false,
      })) ?? store.get("services")
    );
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
      {
        label: "Sound",
        type: "checkbox",
        checked: !service.muted,
        click: () => {
          if (toggleMute(serviceId)) sendUpdated();
        },
      },
      {
        label: "Notifications",
        type: "checkbox",
        checked: service.notificationsEnabled !== false,
        click: () => {
          if (toggleNotifications(serviceId)) sendUpdated();
        },
      },
      {
        label: "Blur when inactive",
        type: "checkbox",
        checked: service.blurWhenInactive === true,
        click: () => {
          if (toggleBlurWhenInactive(serviceId)) sendUpdated();
        },
      },
      {
        label: "Privacy mode",
        type: "checkbox",
        checked: service.privacyMode === true,
        click: () => {
          if (togglePrivacyMode(serviceId)) sendUpdated();
        },
      },
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
        label: "Clear data and sign out",
        click: async () => {
          const win = deps.getMainWindow();
          if (!win) return;
          const { response } = await dialog.showMessageBox(win, {
            type: "warning",
            buttons: ["Clear data", "Cancel"],
            defaultId: 1,
            cancelId: 1,
            title: "Clear data",
            message: `Clear ${service.name}'s data?`,
            detail:
              "This signs the account out and deletes the service's cookies, site data and cache. The service itself is kept.",
          });
          if (response !== 0) return;
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
        },
      },
      { type: "separator" },
      {
        label: "Remove service",
        click: async () => {
          const win = deps.getMainWindow();
          if (!win) return;
          const { response } = await dialog.showMessageBox(win, {
            type: "warning",
            buttons: ["Remove", "Cancel"],
            defaultId: 1,
            cancelId: 1,
            title: "Remove service",
            message: `Remove ${service.name}?`,
            detail: "This will permanently remove the service from Largs Hub.",
          });
          if (response === 0) {
            deps
              .getUiView()
              ?.webContents.send("context-menu-action", { action: "remove-service", serviceId });
          }
        },
      },
    ]);

    menu.popup({ window: mainWindow });
  });
}
