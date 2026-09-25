import { ipcMain, shell } from "electron";
import { isFromApp } from "../appOrigin";
import { createUiLayerCounter } from "../uiLayer";
import { externalWebUrl } from "../externalLinks";
import { setActiveViewVisible, setAutomationSplitOpen } from "../serviceViews";
import { closeLinkPreview } from "./linkPreview";
import { windowState } from "./state";

// UI-layer IPC: z-order, the link preview, the automation split and the
// custom window controls (drawn in React on Windows; macOS has its native
// traffic lights). Only the app's page has the preload, so the isFromApp
// checks are defense in depth (issue #127).
export function registerWindowIpc() {
  const uiLayer = createUiLayerCounter(setActiveViewVisible);
  ipcMain.on("bring-ui-to-front", (event) => {
    if (isFromApp(event)) uiLayer.bringToFront();
  });
  ipcMain.on("send-ui-to-back", (event) => {
    if (isFromApp(event)) uiLayer.sendToBack();
  });

  ipcMain.on("close-link-preview", (event) => {
    if (isFromApp(event)) closeLinkPreview();
  });

  ipcMain.on("open-link-external", (event, url: unknown) => {
    if (!isFromApp(event)) return;
    const external = externalWebUrl(url);
    if (external) shell.openExternal(external);
  });

  // Split the layout into service (left) + automation panel (right) by resizing
  // the active service view, so the service stays visible beside the panel.
  ipcMain.on("set-automation-split", (event, open: unknown) => {
    if (isFromApp(event)) setAutomationSplitOpen(open === true);
  });

  ipcMain.on("window-minimize", (event) => {
    if (isFromApp(event)) windowState.mainWindow?.minimize();
  });
  ipcMain.on("window-maximize", (event) => {
    if (!isFromApp(event)) return;
    const { mainWindow } = windowState;
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", (event) => {
    if (isFromApp(event)) windowState.mainWindow?.close();
  });
}
