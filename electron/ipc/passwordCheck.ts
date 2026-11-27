import { store } from "../store";
import { sanitizeCredential, verifyMasterPassword } from "../masterPassword";
import {
  INITIAL_THROTTLE,
  registerFailure,
  sanitizeThrottle,
  throttleMessage,
  throttleWaitMs,
} from "../lockPolicy";
import type { SecurityResult } from "../shared/types";

// The master password check behind the workspace lock (ipc/security.ts), with
// its wrong-password throttle (issue #111).

export function credential() {
  return sanitizeCredential(store.get("masterPasswordCredential"));
}

// One password check at a time. scrypt is async now, so without this a burst
// of parallel attempts would all read the throttle before any of them had
// recorded a failure, and slip past it.
let checkInFlight = false;

/**
 * The one gate every password goes through: unlocking, turning the lock off
 * and changing the password. Refuses unchecked while the throttle is blocking,
 * records a wrong password, and clears the throttle on a right one.
 */
export async function checkPassword(
  password: unknown,
  wrongMessage: string,
): Promise<SecurityResult> {
  if (checkInFlight) return { ok: false, error: "Still checking the last attempt." };
  const now = Date.now();
  const throttle = sanitizeThrottle(store.get("unlockThrottle"), now);
  const wait = throttleWaitMs(throttle, now);
  if (wait > 0) return { ok: false, error: throttleMessage(wait), retryAfterMs: wait };

  checkInFlight = true;
  try {
    if (await verifyMasterPassword(password, credential())) {
      store.set("unlockThrottle", INITIAL_THROTTLE);
      return { ok: true };
    }
    const next = registerFailure(throttle, Date.now());
    store.set("unlockThrottle", next);
    const nextWait = throttleWaitMs(next, Date.now());
    return nextWait > 0
      ? { ok: false, error: throttleMessage(nextWait), retryAfterMs: nextWait }
      : { ok: false, error: wrongMessage };
  } finally {
    checkInFlight = false;
  }
}
