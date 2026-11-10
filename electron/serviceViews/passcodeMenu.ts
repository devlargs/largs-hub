import type { WebContents } from "electron";
import { passcodeVault, passcodesForService, typeInto } from "../passcodes";
import { viewState } from "./state";

// "Fill passcode" in a service's right-click menu (Settings → Passcodes). Only
// offered on an editable field, and never while the workspace is locked. The
// passcode is decrypted when an item is clicked, not when the menu opens.
export function passcodeMenuItems(
  contents: WebContents,
  serviceId: string,
  params: Electron.ContextMenuParams,
): Electron.MenuItemConstructorOptions[] {
  if (!params.isEditable || viewState.viewsSuppressed) return [];
  const passcodes = passcodesForService(passcodeVault.list(), serviceId);
  if (passcodes.length === 0) return [];

  const fill = (text: string | null) => {
    if (text && !contents.isDestroyed()) void typeInto(contents, text);
  };
  const fillPasscode = (id: string) => fill(passcodeVault.reveal(id));

  const submenu: Electron.MenuItemConstructorOptions[] = passcodes.map((p) => {
    const label = p.username ? `${p.label} (${p.username})` : p.label;
    // With a username, choose which of the two goes in this field
    if (p.username) {
      return {
        label,
        submenu: [
          { label: "Fill passcode", click: () => fillPasscode(p.id) },
          { label: "Fill username", click: () => fill(p.username) },
        ],
      };
    }
    return { label, click: () => fillPasscode(p.id) };
  });

  return [{ label: "Fill passcode", submenu }, { type: "separator" }];
}
