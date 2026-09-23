import { ipcMain, shell } from "electron";
import { createUiLayerCounter } from "../uiLayer";
import { setActiveViewVisible, setAutomationSplitOpen } from "../serviceViews";
import { closeLinkPreview } from "./linkPreview";
import { windowState } from "./state";

// UI-layer IPC: z-order, the link preview, the automation split and the
// custom window controls (drawn in React on Windows; macOS has its native
// traffic lights).
export function registerWindowIpc() {
  const uiLayer = createUiLayerCounter(setActiveViewVisible);
  ipcMain.on("bring-ui-to-front", () => uiLayer.bringToFront());
  ipcMain.on("send-ui-to-back", () => uiLayer.sendToBack());

  ipcMain.on("close-link-preview", () => {
    closeLinkPreview();
  });

  ipcMain.on("open-link-external", (_event, url: string) => {
    if (typeof url === "string" && /^https?:/i.test(url)) {
      shell.openExternal(url);
    }
  });

  // Split the layout into service (left) + automation panel (right) by resizing
  // the active service view, so the service stays visible beside the panel.
  ipcMain.on("set-automation-split", (_event, open: unknown) => {
    setAutomationSplitOpen(open === true);
  });

  ipcMain.on("window-minimize", () => windowState.mainWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    const { mainWindow } = windowState;
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => windowState.mainWindow?.close());
}
