import { randomUUID } from "crypto";
import { clipboard, safeStorage, WebContents } from "electron";
import { store } from "../store";
import { createPasscodeVault, typingSteps } from "./vault";

// The saved-passcode vault, wired to the store and the OS's own encryption
// (safeStorage: DPAPI on Windows, the Keychain on macOS — the same key Chromium
// already uses for the services' cookies, so it adds no new Keychain prompt).
// The logic lives in vault.ts; this file only holds the Electron side.

export { passcodesForService } from "./vault";
export type { PasscodeVault } from "./vault";

export const passcodeVault = createPasscodeVault({
  read: () => store.get("passcodes"),
  write: (passcodes) => store.set("passcodes", passcodes),
  crypto: safeStorage,
  newId: randomUUID,
});

// Long enough to paste it somewhere, short enough that it doesn't sit there
const CLIPBOARD_CLEAR_MS = 30_000;
let clipboardTimer: ReturnType<typeof setTimeout> | null = null;

/** Copies a passcode, and clears the clipboard 30 s later if it still holds it. */
export function copyPasscode(id: unknown): boolean {
  const secret = passcodeVault.reveal(id);
  if (secret === null) return false;
  clipboard.writeText(secret);
  if (clipboardTimer) clearTimeout(clipboardTimer);
  clipboardTimer = setTimeout(() => {
    clipboardTimer = null;
    // Leave it alone if something else has been copied since
    if (clipboard.readText() === secret) clipboard.clear();
  }, CLIPBOARD_CLEAR_MS);
  return true;
}

const KEY_GAP_MS = 12;

/**
 * Types `text` into whatever is focused in `contents` — the field that was
 * right-clicked. Key by key with a short gap, so a page that moves focus from
 * box to box as a PIN is typed keeps up.
 */
export async function typeInto(contents: WebContents, text: string): Promise<void> {
  contents.focus();
  for (const step of typingSteps(text)) {
    if (contents.isDestroyed()) return;
    if (step.kind === "char") {
      contents.sendInputEvent({ type: "char", keyCode: step.value });
    } else {
      await contents.insertText(step.value);
    }
    await new Promise((resolve) => setTimeout(resolve, KEY_GAP_MS));
  }
}
