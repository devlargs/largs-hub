import { randomUUID } from "crypto";
import { clipboard, safeStorage, WebContents } from "electron";
import { store } from "../store";
import type {
  CloudPasscodeKeyPayload,
  CloudPasscodeKeyResult,
  CloudPasscodeKeyring,
  CloudPasscodeVault,
  PasscodeAccountState,
} from "../shared/types";
import { createPasscodeVault, typingSteps, type PasscodeVault } from "./vault";
import { createCloudPasscodes } from "./cloudPasscodes";
import { parseKey, sanitizeKeyring, sanitizeVault } from "./cloudCrypto";

// The saved-passcode vault. Signed out, passcodes are stored on this computer,
// encrypted by the OS (safeStorage: DPAPI on Windows, the Keychain on macOS).
// Signed in, they live in the account only, end to end encrypted
// (cloudPasscodes.ts), and this computer's store holds none: any saved before
// signing in move into the account once it's unlocked. The logic lives in
// vault.ts and cloudPasscodes.ts; this file holds the Electron side.

export { passcodesForService } from "./vault";
export type { PasscodeVault } from "./vault";

const localVault = createPasscodeVault({
  read: () => store.get("passcodes"),
  write: (passcodes) => store.set("passcodes", passcodes),
  crypto: safeStorage,
  newId: randomUUID,
});

let notifyChanged: () => void = () => undefined;

/** Called when the account's passcodes change here, so they get pushed. */
export function onCloudPasscodesChanged(callback: () => void) {
  notifyChanged = callback;
}

const cloud = createCloudPasscodes({ onChange: () => notifyChanged(), newId: randomUUID });

const accountUid = () => store.get("cloudAccountUid");
const signedIn = () => accountUid() !== "";

// The unwrapped account key is kept on this computer only encrypted by the OS,
// so a restart doesn't ask for the account password again. It's dropped on
// sign-out, and when it stops fitting the account's passcodes.
let keyLoadedFor: string | null = null;

function loadSavedKey() {
  const uid = accountUid();
  if (!uid || keyLoadedFor === uid) return;
  keyLoadedFor = uid;
  const saved = store.get("cloudPasscodeKey");
  if (!saved || saved.uid !== uid) return;
  try {
    const key = parseKey(safeStorage.decryptString(Buffer.from(saved.key, "base64")));
    const keyring = sanitizeKeyring(saved.keyring);
    if (key && keyring) cloud.setKey(key, keyring);
  } catch {
    // Encrypted under another OS account: the password unlocks them again
    store.set("cloudPasscodeKey", null);
  }
}

function saveKey(key: Buffer, keyring: CloudPasscodeKeyring) {
  if (!safeStorage.isEncryptionAvailable()) return;
  try {
    const sealed = safeStorage.encryptString(key.toString("base64")).toString("base64");
    store.set("cloudPasscodeKey", { uid: accountUid(), key: sealed, keyring });
  } catch (error) {
    console.error("[passcodes] Couldn't keep the account key:", error);
  }
}

// Passcodes saved on this computer before signing in go to the account, and
// leave this computer's disk. One that can't be decrypted here (saved under
// another OS account) is dropped, as it could never be read anyway.
function moveLocalIntoAccount() {
  if (cloud.state() !== "ready") return;
  const local = localVault.list();
  if (local.length === 0) return;
  const stored = store.get("passcodes");
  const entries = local.flatMap((p) => {
    const plain = localVault.reveal(p.id);
    const entry = stored.find((s) => s.id === p.id);
    return plain && entry ? [{ ...entry, plain }] : [];
  });
  cloud.importLocal(entries);
  store.set("passcodes", []);
}

function afterCloudChange() {
  if (!cloud.hasKey()) store.set("cloudPasscodeKey", null);
  moveLocalIntoAccount();
}

const LOCKED_ERROR = "Unlock your passcodes with your account password first.";

/** Local or account passcodes, whichever apply right now. */
export const passcodeVault: PasscodeVault = {
  available: () => {
    if (!signedIn()) return localVault.available();
    loadSavedKey();
    return cloud.state() === "ready";
  },
  list: () => {
    if (!signedIn()) return localVault.list();
    loadSavedKey();
    return cloud.vault.list();
  },
  save: (raw, serviceIds) => {
    if (!signedIn()) return localVault.save(raw, serviceIds);
    loadSavedKey();
    if (cloud.state() !== "ready") return { ok: false, error: LOCKED_ERROR };
    return cloud.vault.save(raw, serviceIds);
  },
  remove: (id) => (signedIn() ? cloud.vault.remove(id) : localVault.remove(id)),
  reveal: (id) => {
    if (!signedIn()) return localVault.reveal(id);
    loadSavedKey();
    return cloud.vault.reveal(id);
  },
  unlinkService: (serviceId) => {
    localVault.unlinkService(serviceId);
    cloud.vault.unlinkService(serviceId);
  },
};

/** Signed in, where the passcodes stand; undefined when signed out. */
export function passcodeAccountState(): PasscodeAccountState | undefined {
  if (!signedIn()) return undefined;
  loadSavedKey();
  return cloud.state();
}

/** The account's passcodes, from the first sync or a change made elsewhere. */
export function seedCloudPasscodes(raw: unknown) {
  if (!signedIn()) return;
  loadSavedKey();
  cloud.seed(raw === null ? null : sanitizeVault(raw));
  afterCloudChange();
}

export function exportCloudPasscodes(): CloudPasscodeVault | null {
  if (!signedIn()) return null;
  loadSavedKey();
  return cloud.exportVault();
}

export function cloudPasscodeKeyring(): CloudPasscodeKeyring | null {
  if (!signedIn()) return null;
  loadSavedKey();
  return cloud.keyring();
}

export function setCloudPasscodeKey(raw: unknown): CloudPasscodeKeyResult {
  if (!signedIn()) return { ok: false, error: "You're signed out." };
  const payload = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
    Record<keyof CloudPasscodeKeyPayload, unknown>
  >;
  const key = parseKey(payload.key);
  const keyring = sanitizeKeyring(payload.keyring);
  if (!key || !keyring) return { ok: false, error: "That key couldn't be used." };
  loadSavedKey();
  if (!cloud.setKey(key, keyring, payload.startOver === true)) {
    return { ok: false, error: "That key doesn't open your passcodes." };
  }
  saveKey(key, keyring);
  afterCloudChange();
  return { ok: true };
}

/**
 * Who's signed in changed. A different account (or none) forgets the last
 * one's passcodes and key; signed out, the local store is used again.
 */
export function accountChanged(uid: string) {
  if (keyLoadedFor === uid) return;
  cloud.clear();
  keyLoadedFor = null;
  const saved = store.get("cloudPasscodeKey");
  if (saved && saved.uid !== uid) store.set("cloudPasscodeKey", null);
}

// Long enough to paste it somewhere, short enough that it doesn't sit there
const CLIPBOARD_CLEAR_MS = 30_000;
let clipboardTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Copies a passcode, and clears the clipboard 30 s later if it still holds it.
 * Electron 45's clipboard reads and writes are promises, so both are awaited.
 */
export async function copyPasscode(id: unknown): Promise<boolean> {
  const secret = passcodeVault.reveal(id);
  if (secret === null) return false;
  await clipboard.writeText(secret);
  if (clipboardTimer) clearTimeout(clipboardTimer);
  clipboardTimer = setTimeout(() => {
    clipboardTimer = null;
    void clearIfStill(secret);
  }, CLIPBOARD_CLEAR_MS);
  return true;
}

// Leave it alone if something else has been copied since
async function clearIfStill(secret: string): Promise<void> {
  try {
    if ((await clipboard.readText()) === secret) clipboard.clear();
  } catch (err) {
    console.error("[passcodes] clipboard clear failed:", err);
  }
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
