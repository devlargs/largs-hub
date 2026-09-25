// The Windows AppUserModelID (issue #58, and the taskbar icon fix after it).
//
// Windows keys taskbar grouping, the taskbar overlay badge and toast
// notifications off this ID, and caches the taskbar button's icon under it.
// The installed app must use build.appId from package.json, the ID
// electron-builder gives its Start Menu shortcut; a mismatch breaks badges and
// toasts silently. `npm run dev` gets its own ID: it runs the stock
// electron.exe, whose icon is Electron's atom, and when it shared the
// installed app's ID Windows cached that atom for the installed app's
// taskbar button too.
//
// Pure and Electron-free, so it can be unit-tested (test/appUserModelId.test.ts).

/** build.appId in package.json. */
export const APP_ID = "com.largshub.app";

export function appUserModelId(isPackaged: boolean): string {
  return isPackaged ? APP_ID : `${APP_ID}.dev`;
}
