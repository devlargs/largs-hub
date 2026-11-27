import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebase } from "./firebase";
import {
  authErrorCode,
  authErrorMessage,
  GENERIC_AUTH_ERROR,
  RESET_SENT_MESSAGE,
  validateEmail,
  validateSignIn,
  validateSignUp,
  type AuthResult,
} from "./cloudAuthErrors";
import { markInteractiveSignIn, signOutOfCloud, unlockPasscodes } from "./cloud-sync";

// Signing in, creating an account and resetting a password, as results the
// Account form can show. The password goes to Firebase, and to unwrapping the
// account's passcode key right here (cloud-sync/passcodes.ts), and nowhere
// else: not to the main process, not to storage, not to a log.

// The password the sign-in just accepted also unlocks the account's passcodes
// on this computer. Best effort: if it fails, Settings → Passcodes asks.
async function unlockAfterSignIn(result: AuthResult, password: string): Promise<AuthResult> {
  if (result.ok) {
    try {
      const unlocked = await unlockPasscodes(password, true);
      if (!unlocked.ok) console.warn("[account] Passcodes stay locked:", unlocked.error);
    } catch (error) {
      console.warn("[account] Couldn't unlock passcodes:", authErrorCode(error));
    }
  }
  return result;
}

async function attempt(run: () => Promise<unknown>): Promise<AuthResult> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    const message = authErrorMessage(error);
    // The code only, never the error object (it can carry the email).
    if (message === GENERIC_AUTH_ERROR) console.warn("[account] Auth error:", authErrorCode(error));
    return { ok: false, error: message };
  }
}

export async function signUp(
  email: string,
  password: string,
  confirm: string,
): Promise<AuthResult> {
  const invalid = validateSignUp(email, password, confirm);
  if (invalid) return { ok: false, error: invalid };
  markInteractiveSignIn();
  return unlockAfterSignIn(
    await attempt(() => createUserWithEmailAndPassword(getFirebase().auth, email.trim(), password)),
    password,
  );
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const invalid = validateSignIn(email, password);
  if (invalid) return { ok: false, error: invalid };
  markInteractiveSignIn();
  return unlockAfterSignIn(
    await attempt(() => signInWithEmailAndPassword(getFirebase().auth, email.trim(), password)),
    password,
  );
}

// Always the same answer, whether or not the account exists (Firebase's email
// enumeration protection hides that anyway). Only a bad address or a network
// failure shows as an error.
export async function sendReset(email: string): Promise<AuthResult & { message?: string }> {
  const invalid = validateEmail(email);
  if (invalid) return { ok: false, error: invalid };
  const result = await attempt(() => sendPasswordResetEmail(getFirebase().auth, email.trim()));
  if (!result.ok && result.error !== "Can't reach the server. Check your connection.") {
    return { ok: true, message: RESET_SENT_MESSAGE };
  }
  return result.ok ? { ok: true, message: RESET_SENT_MESSAGE } : result;
}

export async function signOutEverywhereLocal(): Promise<AuthResult> {
  return attempt(() => signOutOfCloud());
}
