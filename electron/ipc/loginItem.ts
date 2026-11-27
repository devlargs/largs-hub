import { app } from "electron";

// Launch at startup. On Windows the login item starts the app with an extra
// argument, so cloud sync can tell a launch at sign-in from one the user made
// (ipc/cloud.ts): a computer that starts Largs Hub at sign-in mustn't take the
// account's session from the one actually in use. macOS login items take no
// arguments (args is Windows-only in Electron), so there it's just the flag.

export const LAUNCHED_AT_LOGIN_ARG = "--launched-at-login";

export function applyLoginItem(openAtLogin: boolean): void {
  try {
    app.setLoginItemSettings(
      process.platform === "win32"
        ? { openAtLogin, args: [LAUNCHED_AT_LOGIN_ARG] }
        : { openAtLogin },
    );
  } catch (error) {
    console.error("Failed to update the login item:", error);
  }
}

/**
 * Re-registers the login item at launch, so installs that turned Launch at
 * startup on before the argument existed get it. Windows only, and only for
 * an installed build: from source, process.execPath is the bare Electron
 * binary, which would replace the installed app's entry.
 */
export function refreshLoginItem(enabled: boolean): void {
  if (process.platform !== "win32" || !app.isPackaged || !enabled) return;
  applyLoginItem(true);
}
