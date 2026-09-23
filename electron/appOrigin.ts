import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

// The UI view is the only page with the preload, so the only one holding
// window.electronAPI. This module answers "is this URL the app itself?", for
// the UI view's navigation guard (uiViewGuard.ts) and for the IPC handlers that change
// settings, security or services (issue #112): if anything else ever ended up
// in the UI view (a dropped link, a future <a>), it gets neither the page nor
// the bridge.
//
// isAppUrl is pure and unit-tested (test/appOrigin.test.ts). The entry URL is
// set once by uiViewGuard.ts before the UI view loads.

/**
 * Whether `url` is the app's own page. `appEntryUrl` is what the UI view loads:
 * the Vite dev server (`http://localhost:5173`) in dev, `dist/index.html` as a
 * file URL in production.
 *
 * In dev anything on the dev server's origin counts. In production only that
 * one file does, with any query or hash: every other file:// URL is a file
 * someone dropped, not the app.
 */
export function isAppUrl(url: string | null | undefined, appEntryUrl: string): boolean {
  if (!url) return false;
  let target: URL;
  let entry: URL;
  try {
    target = new URL(url);
    entry = new URL(appEntryUrl);
  } catch {
    return false;
  }
  if (entry.protocol === "file:") {
    return target.protocol === "file:" && samePath(target.pathname, entry.pathname);
  }
  return target.origin === entry.origin;
}

// Windows paths are case-insensitive, and Chromium can hand back the drive
// letter in either case.
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => decodeURIComponent(p).replace(/\\/g, "/").toLowerCase();
  return process.platform === "win32" || process.platform === "darwin"
    ? norm(a) === norm(b)
    : decodeURIComponent(a) === decodeURIComponent(b);
}

let appEntryUrl: string | null = null;

export function setAppEntryUrl(url: string): void {
  appEntryUrl = url;
}

/**
 * Whether an IPC message came from the app's own page. Handlers that change
 * stored settings, the lock or the service list refuse anything else. A
 * missing frame (navigated away or torn down mid-call) is refused too.
 */
export function isFromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (!appEntryUrl) return false;
  return isAppUrl(event.senderFrame?.url, appEntryUrl);
}
