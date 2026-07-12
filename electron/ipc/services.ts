import { ipcMain, dialog, Menu, BrowserWindow, WebContentsView } from "electron";
import { store, Service, sanitizeService } from "../store";
import {
  getServiceView,
  destroyServiceView,
  showService,
  hideActiveService,
  isWindowFocused,
  applyBlurToView,
  removeBlurFromView,
} from "../serviceViews";

// IPC: service CRUD, per-service toggles, view navigation, and the native
// service context menu.

interface ServicesIpcDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
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

  ipcMain.handle("remove-service", (_event, serviceId: string) => {
    const services = store.get("services").filter((s) => s.id !== serviceId);
    store.set("services", services);

    // Clean up the view
    destroyServiceView(serviceId, { clearCounts: true });

    // Drop any Notion Note Taker credentials tied to this service
    const notionConfigs = store.get("notionNotes");
    if (notionConfigs[serviceId]) {
      delete notionConfigs[serviceId];
      store.set("notionNotes", notionConfigs);
    }

    return services;
  });

  ipcMain.handle("update-service", (_event, rawUpdated: unknown) => {
    const updated = sanitizeService(rawUpdated);
    if (!updated) return store.get("services");
    const old = store.get("services").find((s) => s.id === updated.id);
    const services = store
      .get("services")
      .map((s) => (s.id === updated.id ? updated : s));
    store.set("services", services);

    // If the URL changed, destroy the old view so it gets recreated with the new URL
    if (old && old.url !== updated.url) {
      destroyServiceView(updated.id);
    }

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
    const services = store.get("services");
    const updated = services.map((s) => {
      if (s.id === serviceId) {
        const muted = !s.muted;
        // Apply mute to the live view
        const view = getServiceView(serviceId);
        if (view) {
          view.webContents.setAudioMuted(muted);
        }
        return { ...s, muted };
      }
      return s;
    });
    store.set("services", updated);
    return updated;
  });

  ipcMain.handle("toggle-service-enabled", (_event, serviceId: string) => {
    const services = store.get("services");
    const updated = services.map((s) => {
      if (s.id === serviceId) {
        const enabled = s.enabled === false; // toggle: undefined/true -> false, false -> true
        if (!enabled) {
          // Destroy the view when disabling
          destroyServiceView(serviceId, { clearCounts: true });
        }
        return { ...s, enabled };
      }
      return s;
    });
    store.set("services", updated);
    return updated;
  });

  ipcMain.handle("toggle-service-notifications", (_event, serviceId: string) => {
    const services = store.get("services");
    const updated = services.map((s) => {
      if (s.id === serviceId) {
        return { ...s, notificationsEnabled: s.notificationsEnabled === false };
      }
      return s;
    });
    store.set("services", updated);
    return updated;
  });

  ipcMain.on("show-service", (_event, serviceId: string) => {
    showService(serviceId);
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
          const svc = store.get("services").find((s) => s.id === serviceId);
          if (!svc) return;
          const enabled = svc.enabled === false;
          if (!enabled) {
            destroyServiceView(serviceId, { clearCounts: true });
          }
          const updated = store.get("services").map((s) =>
            s.id === serviceId ? { ...s, enabled } : s,
          );
          store.set("services", updated);
          deps.getUiView()?.webContents.send("services-updated", updated);
          // If re-enabling the active service, show it
          if (enabled) {
            deps.getUiView()?.webContents.send("context-menu-action", { action: "show-service", serviceId });
          }
        },
      },
      {
        label: "Sound",
        type: "checkbox",
        checked: !service.muted,
        click: () => {
          const muted = !service.muted;
          const view = getServiceView(serviceId);
          if (view) view.webContents.setAudioMuted(muted);
          const updated = store.get("services").map((s) =>
            s.id === serviceId ? { ...s, muted } : s,
          );
          store.set("services", updated);
          sendUpdated();
        },
      },
      {
        label: "Notifications",
        type: "checkbox",
        checked: service.notificationsEnabled !== false,
        click: () => {
          const updated = store.get("services").map((s) =>
            s.id === serviceId
              ? { ...s, notificationsEnabled: s.notificationsEnabled === false }
              : s,
          );
          store.set("services", updated);
          sendUpdated();
        },
      },
      {
        label: "Blur when inactive",
        type: "checkbox",
        checked: service.blurWhenInactive === true,
        click: () => {
          const svc = store.get("services").find((s) => s.id === serviceId);
          if (!svc) return;
          const blurWhenInactive = !svc.blurWhenInactive;
          const updated = store.get("services").map((s) =>
            s.id === serviceId ? { ...s, blurWhenInactive } : s,
          );
          store.set("services", updated);
          sendUpdated();
          // Apply/remove blur immediately if the window is already unfocused
          if (!isWindowFocused()) {
            const view = getServiceView(serviceId);
            if (view && !view.webContents.isDestroyed()) {
              if (blurWhenInactive) applyBlurToView(view);
              else removeBlurFromView(view);
            }
          }
        },
      },
      { type: "separator" },
      {
        label: "Edit service",
        click: () => {
          deps.getUiView()?.webContents.send("context-menu-action", { action: "edit-service", serviceId });
        },
      },
      {
        label: "Reload",
        click: () => {
          const view = getServiceView(serviceId);
          if (view) view.webContents.reload();
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
            deps.getUiView()?.webContents.send("context-menu-action", { action: "remove-service", serviceId });
          }
        },
      },
    ]);

    menu.popup({ window: mainWindow });
  });
}
