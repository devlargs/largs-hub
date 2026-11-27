import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { getDoc } from "firebase/firestore";
import type { CloudPasscodeKeyring } from "../../types";
import { getFirebase } from "../firebase";
import { authErrorCode, authErrorMessage } from "../cloudAuthErrors";
import { createKeyring, openKeyring } from "../passcodeKey";
import { cloud, userRef } from "./core";

// Unlocking the account's passcodes on this computer: the account password
// unwraps the passcode key (passcodeKey.ts), which goes to main. The password
// is used here and dropped; it never reaches main or storage.

export type UnlockResult =
  | { ok: true }
  // canStartOver: the password is right, but the passcodes were saved under
  // an earlier one (it was reset by email), so they can't be decrypted
  | { ok: false; error: string; canStartOver?: boolean };

const RESET_ERROR =
  "Your passcodes were saved under an earlier password (it was reset since), so they can't be opened with this one.";

// The keyring main last saw in the account, else the account's own copy. Null
// only when the account really has none; offline, this throws, so a new key is
// never made just because the account couldn't be reached.
async function accountKeyring(uid: string): Promise<CloudPasscodeKeyring | null> {
  const known = await cloud().passcodeKeyring();
  if (known) return known;
  const snap = await getDoc(userRef(uid));
  const vault = snap.data()?.workspace?.passcodeVault;
  return vault?.keyring ?? null;
}

// Settings asks for the password again, so a typo isn't taken for a reset
async function checkPassword(password: string): Promise<UnlockResult> {
  const user = getFirebase().auth.currentUser;
  if (!user?.email) return { ok: false, error: "You're signed out." };
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return { ok: true };
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      return { ok: false, error: "That isn't your account password." };
    }
    return { ok: false, error: authErrorMessage(error) };
  }
}

/**
 * Unlocks the passcodes with the account password. `verified` skips asking
 * Firebase again, for the password a sign-in just accepted.
 */
export async function unlockPasscodes(password: string, verified = false): Promise<UnlockResult> {
  const user = getFirebase().auth.currentUser;
  if (!user) return { ok: false, error: "You're signed out." };
  if (!verified) {
    const checked = await checkPassword(password);
    if (!checked.ok) return checked;
  }
  // Main may not have heard about the sign-in yet
  await cloud().setAccount(user.uid);
  let keyring: CloudPasscodeKeyring | null;
  try {
    keyring = await accountKeyring(user.uid);
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection." };
  }
  if (!keyring) {
    const created = await createKeyring(password);
    return cloud().setPasscodeKey(created);
  }
  const key = await openKeyring(password, keyring);
  if (!key) return { ok: false, error: RESET_ERROR, canStartOver: true };
  const result = await cloud().setPasscodeKey({ key, keyring });
  return result.ok ? result : { ...result, canStartOver: true };
}

/**
 * After a password reset: a new key under the current password, and an empty
 * list. The old passcodes are gone for good; nobody could have decrypted them.
 */
export async function startPasscodesOver(password: string): Promise<UnlockResult> {
  const checked = await checkPassword(password);
  if (!checked.ok) return checked;
  const created = await createKeyring(password);
  return cloud().setPasscodeKey({ ...created, startOver: true });
}
