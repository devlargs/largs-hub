import { WebContents, shell } from "electron";
import path from "path";
import { pathToFileURL } from "url";
import { isAppUrl, setAppEntryUrl } from "./appOrigin";
import { IS_DEV } from "./devMode";

// Keeps the UI view on the app (issue #112). The UI view holds
// window.electronAPI, and Chromium navigates a webContents to whatever is
// dropped on it (a link dragged out of a service, a file from the desktop).
// The preload would run in that page too.

/**
 * The page the UI view loads: the Vite dev server in dev, the built
 * index.html otherwise. Registered as the app's origin here, at import, so it's
 * in place before any IPC can arrive (appOrigin.ts).
 */
export const APP_ENTRY_URL = IS_DEV
  ? "http://localhost:5173"
  : pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
setAppEntryUrl(APP_ENTRY_URL);

/**
 * Cancel any navigation away from the app. window.open and middle-click never
 * open an Electron window: web links go to the system browser, anything else
 * is dropped.
 */
export function guardUiView(webContents: WebContents): void {
  const stayOnApp = (event: Electron.Event, url: string) => {
    if (!isAppUrl(url, APP_ENTRY_URL)) event.preventDefault();
  };
  webContents.on("will-navigate", stayOnApp);
  webContents.on("will-redirect", stayOnApp);
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // No <webview> either: it would be a second page inside the one with the
  // bridge.
  webContents.on("will-attach-webview", (event) => event.preventDefault());
}
