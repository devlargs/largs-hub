import { ipcMain } from "electron";
import { store } from "../store";
import { isFromApp } from "../appOrigin";
import { copyPasscode, passcodeVault } from "../passcodes";
import type { PasscodesResult } from "../shared/types";
import { isWorkspaceLocked } from "./security";

// IPC: Settings → Passcodes. Passcodes only ever go in over the bridge; the
// list carries names and usernames, and copying happens here in main, so a
// saved passcode never reaches the renderer.
//
// Every handler answers only the app's own page and does nothing while the
// workspace is locked.

function result(ok = true, error?: string): PasscodesResult {
  return {
    ok,
    ...(error ? { error } : {}),
    available: passcodeVault.available(),
    passcodes: passcodeVault.list(),
  };
}

const LOCKED = "Unlock the workspace first.";

export function registerPasscodesIpc() {
  ipcMain.handle("passcodes-list", (event): PasscodesResult => {
    if (!isFromApp(event)) return { ok: false, available: false, passcodes: [] };
    if (isWorkspaceLocked()) return { ok: false, error: LOCKED, available: false, passcodes: [] };
    return result();
  });

  ipcMain.handle("passcodes-save", (event, draft: unknown): PasscodesResult => {
    if (!isFromApp(event)) return result(false, "Not allowed.");
    if (isWorkspaceLocked()) return result(false, LOCKED);
    const saved = passcodeVault.save(
      draft,
      store.get("services").map((s) => s.id),
    );
    return saved.ok ? result() : result(false, saved.error);
  });

  ipcMain.handle("passcodes-remove", (event, id: unknown): PasscodesResult => {
    if (!isFromApp(event)) return result(false, "Not allowed.");
    if (isWorkspaceLocked()) return result(false, LOCKED);
    passcodeVault.remove(id);
    return result();
  });

  ipcMain.handle("passcodes-copy", (event, id: unknown): PasscodesResult => {
    if (!isFromApp(event)) return result(false, "Not allowed.");
    if (isWorkspaceLocked()) return result(false, LOCKED);
    return copyPasscode(id)
      ? result()
      : result(false, "This passcode can't be read on this computer. Edit it and enter it again.");
  });
}
