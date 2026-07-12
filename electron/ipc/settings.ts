import { app, ipcMain, dialog, Menu, BrowserWindow, WebContentsView } from "electron";
import path from "path";
import fs from "fs";
import { store } from "../store";

// IPC: theme, app settings, download folder picker, custom icon storage, and
// the native settings menu.

interface SettingsIpcDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
}

export function registerSettingsIpc(deps: SettingsIpcDeps) {
  // Theme
  ipcMain.handle("get-theme", () => store.get("theme"));
  ipcMain.handle("set-theme", (_event, theme: "dark" | "light") => {
    store.set("theme", theme);
  });

  // Settings
  ipcMain.handle("get-settings", () => {
    return {
      downloadFolder: store.get("downloadFolder"),
      wakeServicesAutomatically: store.get("wakeServicesAutomatically"),
      launchAtStartup: store.get("launchAtStartup"),
      openFolderOnFinish: store.get("openFolderOnFinish"),
      openFileOnFinish: store.get("openFileOnFinish"),
      downloadAlertOnFinish: store.get("downloadAlertOnFinish"),
      hibernateInactiveMinutes: store.get("hibernateInactiveMinutes"),
    };
  });

  ipcMain.handle("update-setting", (_event, key: string, value: unknown) => {
    if (key === "downloadFolder" && typeof value === "string") {
      store.set("downloadFolder", value);
    } else if (key === "wakeServicesAutomatically" && typeof value === "boolean") {
      store.set("wakeServicesAutomatically", value);
    } else if (key === "launchAtStartup" && typeof value === "boolean") {
      store.set("launchAtStartup", value);
      app.setLoginItemSettings({ openAtLogin: value });
    } else if (key === "openFolderOnFinish" && typeof value === "boolean") {
      store.set("openFolderOnFinish", value);
    } else if (key === "openFileOnFinish" && typeof value === "boolean") {
      store.set("openFileOnFinish", value);
    } else if (key === "downloadAlertOnFinish" && typeof value === "boolean") {
      store.set("downloadAlertOnFinish", value);
    } else if (
      key === "hibernateInactiveMinutes" &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      store.set("hibernateInactiveMinutes", Math.floor(value));
    }
  });

  ipcMain.handle("select-download-folder", async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Download Folder",
      defaultPath: store.get("downloadFolder") || undefined,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    store.set("downloadFolder", folder);
    return folder;
  });

  // Custom icons
  const customIconsDir = path.join(app.getPath("userData"), "custom-icons");

  // Resolve a user-supplied icon file name to a path safely contained inside
  // customIconsDir. Returns null if the name would escape the directory.
  function resolveCustomIconPath(fileName: unknown): string | null {
    if (typeof fileName !== "string" || fileName.length === 0) return null;
    // Strip any directory components (e.g. "../../evil") before joining
    const safeName = path.basename(fileName);
    if (safeName === "." || safeName === "..") return null;
    const filePath = path.resolve(customIconsDir, safeName);
    if (!filePath.startsWith(customIconsDir + path.sep)) return null;
    return filePath;
  }

  const ICON_DATA_URL_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/;

  ipcMain.handle("save-custom-icon", async (_event, { fileName, dataUrl }: { fileName: string; dataUrl: string }) => {
    const filePath = resolveCustomIconPath(fileName);
    if (!filePath) throw new Error("Invalid icon file name");
    if (typeof dataUrl !== "string" || !ICON_DATA_URL_RE.test(dataUrl)) {
      throw new Error("Invalid icon data");
    }
    if (!fs.existsSync(customIconsDir)) {
      fs.mkdirSync(customIconsDir, { recursive: true });
    }
    const base64 = dataUrl.replace(ICON_DATA_URL_RE, "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return filePath;
  });

  ipcMain.handle("delete-custom-icon", async (_event, fileName: string) => {
    const filePath = resolveCustomIconPath(fileName);
    if (!filePath) return;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  // Native settings menu
  ipcMain.on("show-settings-menu", () => {
    const mainWindow = deps.getMainWindow();
    const uiView = deps.getUiView();
    if (!mainWindow || !uiView) return;
    const menu = Menu.buildFromTemplate([
      {
        label: "Check for Updates",
        click: () => {
          deps.getUiView()?.webContents.send("context-menu-action", { action: "show-update-page", serviceId: "" });
        },
      },
    ]);
    menu.popup({ window: mainWindow });
  });
}
