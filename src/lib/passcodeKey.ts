import type { CloudPasscodeKeyring } from "../types";

// The account's passcode key, wrapped with the account password (WebCrypto,
// so it's the same on Windows and macOS). Pure, so it is unit-tested
// (test/passcodeKey.test.ts).
//
// Passcodes in the account are encrypted with a random 256-bit key. The
// account stores that key only wrapped (AES-GCM) under a key derived from the
// account password (PBKDF2-SHA-256, a fresh salt per account). Firebase never
// sees the password, so neither Firebase nor anyone holding the database can
// unwrap it. The unwrapped key goes to main, which alone uses it.

// OWASP's current figure for PBKDF2-HMAC-SHA256
export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));

async function wrappingKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** A new key for an account that has none yet, and its keyring. */
export async function createKeyring(
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ key: string; keyring: CloudPasscodeKeyring }> {
  const key = randomBytes(KEY_BYTES);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const wrapper = await wrappingKey(password, salt, iterations);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapper, key),
  );
  return {
    key: toBase64(key),
    keyring: {
      v: 1,
      salt: toBase64(salt),
      iterations,
      iv: toBase64(iv),
      wrappedKey: toBase64(wrapped),
    },
  };
}

/** The key, or null when the password isn't the one the keyring was made with. */
export async function openKeyring(
  password: string,
  keyring: CloudPasscodeKeyring,
): Promise<string | null> {
  try {
    const wrapper = await wrappingKey(password, fromBase64(keyring.salt), keyring.iterations);
    const key = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(keyring.iv) },
      wrapper,
      fromBase64(keyring.wrappedKey),
    );
    return key.byteLength === KEY_BYTES ? toBase64(new Uint8Array(key)) : null;
  } catch {
    return null;
  }
}
