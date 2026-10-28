import { ipcMain, Menu, BrowserWindow, WebContentsView } from "electron";
import { store } from "../store";
import { hiddenServices } from "../shared/serviceVisibility";
import { toggleHidden } from "./serviceToggles";

interface HiddenServicesMenuDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
}

// The Hidden Services button above the lock: a native menu listing the
// services hidden from the sidebar, each with Open and Unhide. Native for the
// same reason as the service context menu — an HTML menu can't draw above a
// service view. Opening goes back to the renderer as a "select-service"
// action, so a disabled service gets its React page like a sidebar click.
export function registerHiddenServicesMenuIpc(deps: HiddenServicesMenuDeps) {
  ipcMain.on("show-hidden-services-menu", () => {
    const mainWindow = deps.getMainWindow();
    const hidden = hiddenServices(store.get("services"));
    if (!mainWindow || hidden.length === 0) return;

    const send = (channel: string, payload: unknown) =>
      deps.getUiView()?.webContents.send(channel, payload);

    const menu = Menu.buildFromTemplate([
      { label: "Hidden services", enabled: false },
      { type: "separator" },
      ...hidden.map((service) => ({
        label: service.name,
        submenu: [
          {
            label: "Open",
            click: () =>
              send("context-menu-action", { action: "select-service", serviceId: service.id }),
          },
          {
            label: "Unhide",
            click: () => {
              if (toggleHidden(service.id)) send("services-updated", store.get("services"));
            },
          },
        ],
      })),
    ]);

    menu.popup({ window: mainWindow });
  });
}
