// The main window: the frameless BrowserWindow, the React UI layer (uiView)
// drawn over it, the link-preview overlay, and the IPC that controls them.
//
//   state.ts        the window, UI view and preview refs + Ctrl hint tracker
//   create.ts       building the window and UI view, window events, tray
//   linkPreview.ts  the link-preview overlay view
//   ipc.ts          z-order, link preview, automation split, window controls

export { windowState, getMainWindow, getUiView, shortcutHints } from "./state";
export { createWindow } from "./create";
export { openLinkPreview, closeLinkPreview } from "./linkPreview";
export { registerWindowIpc } from "./ipc";
