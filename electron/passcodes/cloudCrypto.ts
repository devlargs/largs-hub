import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CloudPasscodeKeyring, CloudPasscodeVault } from "../shared/types";
import type { PasscodeCrypto } from "./vault";

// The encryption behind passcodes kept in the account (cloudPasscodes.ts):
// AES-256-GCM under the account's passcode key, which only ever exists
// unwrapped in memory here and in the renderer that unwrapped it. Pure, so it
// is unit-tested (test/passcodeCloudCrypto.test.ts).
//
// Sealed format, base64: 12-byte nonce, ciphertext, 16-byte tag. The same
// layout WebCrypto's AES-GCM produces, which the renderer uses for the keyring.

export const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Generous, but far under Firestore's 1 MiB per document
export const MAX_VAULT_DATA_LENGTH = 700_000;
const MAX_KEYRING_FIELD = 200;
// What the renderer uses, and bounds on what the account may claim
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 5_000_000;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

/** The plaintext, or null when the key is wrong or the data was altered. */
export function open(key: Buffer, sealed: string): string | null {
  try {
    const bytes = Buffer.from(sealed, "base64");
    if (bytes.length < IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    const body = bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The vault's PasscodeCrypto (vault.ts) under the account key, so each
 * passcode stays encrypted in memory too and is only decrypted to be typed or
 * copied, exactly as with the OS encryption.
 */
export function keyCrypto(key: Buffer): PasscodeCrypto {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(seal(key, value), "base64"),
    decryptString: (buffer) => {
      const value = open(key, buffer.toString("base64"));
      if (value === null) throw new Error("Couldn't decrypt the passcode");
      return value;
    },
  };
}

/** A 32-byte key sent as base64, or null. */
export function parseKey(raw: unknown): Buffer | null {
  if (typeof raw !== "string" || raw.length > 64 || !BASE64.test(raw)) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === KEY_BYTES ? key : null;
}

const isBase64 = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && BASE64.test(value);

export function sanitizeKeyring(raw: unknown): CloudPasscodeKeyring | null {
  if (typeof raw !== "object" || raw === null) return null;
  const k = raw as Record<string, unknown>;
  if (k.v !== 1) return null;
  if (!isBase64(k.salt, MAX_KEYRING_FIELD) || !isBase64(k.iv, MAX_KEYRING_FIELD)) return null;
  if (!isBase64(k.wrappedKey, MAX_KEYRING_FIELD)) return null;
  const { iterations } = k;
  if (typeof iterations !== "number" || !Number.isInteger(iterations)) return null;
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
  return { v: 1, salt: k.salt, iterations, iv: k.iv, wrappedKey: k.wrappedKey };
}

export function sanitizeVault(raw: unknown): CloudPasscodeVault | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  const keyring = sanitizeKeyring(v.keyring);
  if (!keyring || !isBase64(v.data, MAX_VAULT_DATA_LENGTH)) return null;
  return { keyring, data: v.data };
}

export const sameKeyring = (a: CloudPasscodeKeyring | null, b: CloudPasscodeKeyring | null) =>
  !!a && !!b && a.salt === b.salt && a.iv === b.iv && a.wrappedKey === b.wrappedKey;
