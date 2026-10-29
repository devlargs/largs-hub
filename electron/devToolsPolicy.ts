// When DevTools may be opened, and which keys open them. Kept pure so it can be
// tested without Electron; devTools.ts applies it.
//
// A packaged build only offers DevTools with Settings → Developer → Debug mode
// on, and never while the workspace is locked: DevTools on the UI view is a
// console with window.electronAPI in it, and on a service view it shows the
// page the lock screen is hiding (issue #111).

export interface DevToolsContext {
  packaged: boolean;
  debugMode: boolean;
  locked: boolean;
}

export const devToolsAllowed = ({ packaged, debugMode, locked }: DevToolsContext): boolean =>
  !locked && (debugMode || !packaged);

export interface DevToolsKeyInput {
  type: string;
  code: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * F12 anywhere, or Chrome's own chord: Cmd+Option+I on macOS, Ctrl+Shift+I
 * elsewhere. Matched on the physical key (`code`), since Option+I on a Mac
 * types a dead key rather than "i".
 */
export function isDevToolsShortcut(input: DevToolsKeyInput, platform: string): boolean {
  if (input.type !== "keyDown") return false;
  if (input.code === "F12") return true;
  if (input.code !== "KeyI") return false;
  return platform === "darwin"
    ? input.meta && input.alt && !input.control && !input.shift
    : input.control && input.shift && !input.alt && !input.meta;
}
