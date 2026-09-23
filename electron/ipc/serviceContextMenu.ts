import { ipcMain, Menu, BrowserWindow, WebContentsView } from "electron";
import { store } from "../store";
import { isTasksService } from "../shared/types";
import { getServiceView } from "../serviceViews";
import { hasAutomationForService } from "../messengerAutomation";
import { enableToggleNeedsConfirm } from "../serviceFlags";
import {
  serviceDisplayMenuItems,
  servicePermissionMenuItems,
  toggleEnabled,
} from "./serviceToggles";

interface ContextMenuDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
}

// Native context menu for services — always renders on top of WebContentsViews.
// Anything the renderer has to handle (editing, confirmations) goes back as a
// "context-menu-action" event (src/hooks/useServiceEvents.ts).
export function registerServiceContextMenuIpc(deps: ContextMenuDeps) {
  const sendAction = (action: string, serviceId: string) =>
    deps.getUiView()?.webContents.send("context-menu-action", { action, serviceId });

  ipcMain.on("show-service-context-menu", (_event, serviceId: string) => {
    const mainWindow = deps.getMainWindow();
    const uiView = deps.getUiView();
    const service = store.get("services").find((s) => s.id === serviceId);
    if (!service || !mainWindow || !uiView) return;

    const sendUpdated = () => {
      deps.getUiView()?.webContents.send("services-updated", store.get("services"));
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
            sendAction("confirm-disable-service", serviceId);
            return;
          }
          const updated = toggleEnabled(serviceId);
          if (!updated) return;
          sendUpdated();
          // If re-enabling, bring the service back on screen.
          if (updated.find((s) => s.id === serviceId)?.enabled !== false) {
            sendAction("show-service", serviceId);
          }
        },
      },
      // None of these mean anything for the Todo service (see isTasksService)
      ...(isTasksService(service)
        ? []
        : [
            ...serviceDisplayMenuItems(service, sendUpdated),
            { type: "separator" as const },
            ...servicePermissionMenuItems(service, sendUpdated),
          ]),
      { type: "separator" },
      {
        label: "Edit service",
        click: () => sendAction("edit-service", serviceId),
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
        click: () => sendAction("confirm-clear-data", serviceId),
      },
      { type: "separator" },
      {
        label: "Remove service",
        click: () => sendAction("confirm-remove-service", serviceId),
      },
    ]);

    menu.popup({ window: mainWindow });
  });
}
