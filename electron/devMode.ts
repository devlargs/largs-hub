import { app, Menu } from "electron";

// What a packaged build lets you do that a development build does (issue #111).
//
// DevTools on the UI view is a one-line bypass of the workspace lock: the
// console can call window.electronAPI directly. So a packaged build never
// offers them, and `--dev` only means something when running from source.
// Otherwise anyone could start the installed app with `--dev` to load whatever
// is serving on localhost:5173 in place of the app.

/** Running from source with the dev server (npm run dev). */
export const IS_DEV =
  !app.isPackaged && (process.env.NODE_ENV === "development" || process.argv.includes("--dev"));

/** DevTools are for running from source only. */
export const DEVTOOLS_ENABLED = !app.isPackaged;

/**
 * The application menu. Running from source keeps Electron's default menu,
 * DevTools and reload included. A packaged build drops everything that could
 * open DevTools or reload the UI:
 *
 * - Windows/Linux: no menu at all. The window is frameless, so it was never
 *   shown, but its accelerators (Ctrl+Shift+I, Ctrl+R) still fired. Copy and
 *   paste work without it; Chromium handles them in the page.
 * - macOS: a menu is needed for Cmd+C/V/X/A/Z, Cmd+Q, Cmd+W, Cmd+M and full
 *   screen to work at all, so it keeps the standard App, File, Edit, View
 *   (full screen only) and Window menus, with no DevTools or Reload items.
 */
export function installAppMenu(): void {
  if (DEVTOOLS_ENABLED) return;
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "fileMenu" },
      { role: "editMenu" },
      { label: "View", submenu: [{ role: "togglefullscreen" }] },
      { role: "windowMenu" },
    ]),
  );
}
