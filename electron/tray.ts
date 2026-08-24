import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import path from "path";
import { store } from "./store";
import { renderBadgePng } from "./badgeImage";
import { trayServiceEntries, trayServiceLabel, trayTooltip } from "./trayMenu";

// The tray icon: an unread badge, a menu that jumps straight to a service, and
// left-click to restore the window (issue #90).
//
// The tray only exists while "close to tray" or "minimize to tray" is on. With
// both off nothing is created, so the app behaves exactly as it did before.

interface TrayDeps {
  getMainWindow(): BrowserWindow | null;
  showService(serviceId: string): void;
  getNotificationCounts(): Record<string, number>;
}

let tray: Tray | null = null;
let deps: TrayDeps | null = null;
// Set when the user picks Quit, so the close handler stops hiding to tray.
let quitting = false;

export function initTray(d: TrayDeps) {
  deps = d;
}

export function isTrayAvailable(): boolean {
  return tray !== null;
}

export function isQuitting(): boolean {
  return quitting;
}

function baseIcon(): Electron.NativeImage {
  // assets/ico is bundled inside app.asar (see package.json "files"), and
  // getAppPath() points at the asar when packaged and at the repo in dev.
  // nativeImage reads through the archive, so one path covers both.
  const image = nativeImage.createFromPath(
    path.join(app.getAppPath(), "assets", "ico", "icon.png"),
  );
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

// The unread total as a small badge image, reusing the taskbar badge renderer.
function badgeIcon(total: number): Electron.NativeImage {
  const size = 16;
  const icon = nativeImage.createFromBuffer(renderBadgePng(total, size), {
    width: size,
    height: size,
    scaleFactor: 1,
  });
  return icon;
}

function showWindow() {
  const win = deps?.getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildMenu(): Electron.Menu {
  const win = deps?.getMainWindow() ?? null;
  const visible = win !== null && !win.isDestroyed() && win.isVisible();
  const counts = deps?.getNotificationCounts() ?? {};
  const entries = trayServiceEntries(store.get("services"), counts);

  const serviceItems: Electron.MenuItemConstructorOptions[] = entries.map((entry) => ({
    label: trayServiceLabel(entry),
    click: () => {
      showWindow();
      deps?.showService(entry.id);
    },
  }));

  return Menu.buildFromTemplate([
    {
      label: visible ? "Hide window" : "Show window",
      click: () => {
        if (visible) win?.hide();
        else showWindow();
      },
    },
    ...(serviceItems.length > 0
      ? ([{ type: "separator" }, ...serviceItems] as Electron.MenuItemConstructorOptions[])
      : []),
    { type: "separator" },
    {
      label: "Quit Largs Hub",
      click: () => {
        // Without this the close handler would hide to tray instead of exiting.
        quitting = true;
        app.quit();
      },
    },
  ]);
}

/** Create the tray if a setting asks for it, or destroy it if neither does. */
export function syncTray() {
  const wanted = store.get("closeToTray") || store.get("minimizeToTray");
  if (!wanted) {
    destroyTray();
    return;
  }
  if (tray) {
    refreshTray();
    return;
  }
  try {
    tray = new Tray(baseIcon());
    tray.on("click", showWindow);
    refreshTray();
  } catch (err) {
    // A tray can fail to create on a system with no notification area; the
    // close/minimize actions fall back to quitting rather than vanishing.
    console.error("Failed to create the tray icon:", err);
    tray = null;
  }
}

/** Re-render the tooltip, badge and menu after a count or service change. */
export function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const counts = deps?.getNotificationCounts() ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + Math.max(0, n), 0);
  tray.setToolTip(trayTooltip(total));
  tray.setContextMenu(buildMenu());
  if (total > 0) {
    const badge = badgeIcon(total);
    if (!badge.isEmpty()) tray.setImage(badge);
    else tray.setImage(baseIcon());
  } else {
    tray.setImage(baseIcon());
  }
}

export function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
