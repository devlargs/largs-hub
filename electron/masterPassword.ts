import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Master-password hashing for the workspace lock.
//
// Deliberately free of Electron imports: it is unit-tested (CLAUDE.md), and
// verifyMasterPassword is the single seam a cloud-backed credential store would
// replace — nothing else in the app compares a password.
//
// Note the plaintext password never reaches the store. What is written is a
// salted scrypt hash; see the caveat in the settings copy — electron-store
// writes plain JSON, so this is a screen lock, not encryption of the workspace.

export interface MasterPasswordCredential {
  algorithm: "scrypt";
  // Hex-encoded, one per credential, so two identical passwords hash differently
  salt: string;
  hash: string;
  keyLength: number;
  cost: number;
  blockSize: number;
  parallelization: number;
}

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 4;

// Shared by the "set a password" and "change password" flows so both reject the
// same things with the same words.
export function validateNewPassword(password: unknown, confirm: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

function derive(password: string, salt: Buffer, credential?: MasterPasswordCredential): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, credential?.keyLength ?? KEY_LENGTH, {
    N: credential?.cost ?? COST,
    r: credential?.blockSize ?? BLOCK_SIZE,
    p: credential?.parallelization ?? PARALLELIZATION,
    // 128 * N * r plus headroom; the default 32 MB is already enough for the
    // parameters above, but a stored credential could carry a higher cost.
    maxmem: 256 * (credential?.cost ?? COST) * (credential?.blockSize ?? BLOCK_SIZE),
  });
}

export function hashMasterPassword(password: string): MasterPasswordCredential {
  const salt = randomBytes(SALT_BYTES);
  const credential: MasterPasswordCredential = {
    algorithm: "scrypt",
    salt: salt.toString("hex"),
    hash: "",
    keyLength: KEY_LENGTH,
    cost: COST,
    blockSize: BLOCK_SIZE,
    parallelization: PARALLELIZATION,
  };
  credential.hash = derive(password, salt, credential).toString("hex");
  return credential;
}

// Stored JSON is user-writable, so every field is checked before it is fed to
// scrypt — a bad cost or key length would otherwise throw on unlock and leave
// the app permanently locked.
export function sanitizeCredential(raw: unknown): MasterPasswordCredential | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (c.algorithm !== "scrypt") return null;
  if (typeof c.salt !== "string" || !/^[0-9a-f]+$/i.test(c.salt) || c.salt.length === 0)
    return null;
  if (typeof c.hash !== "string" || !/^[0-9a-f]+$/i.test(c.hash) || c.hash.length === 0)
    return null;
  const positive = (value: unknown, max: number) =>
    typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;
  if (!positive(c.keyLength, 256)) return null;
  if (!positive(c.cost, 1 << 20)) return null;
  if (!positive(c.blockSize, 64)) return null;
  if (!positive(c.parallelization, 16)) return null;
  return {
    algorithm: "scrypt",
    salt: c.salt,
    hash: c.hash,
    keyLength: c.keyLength as number,
    cost: c.cost as number,
    blockSize: c.blockSize as number,
    parallelization: c.parallelization as number,
  };
}

// The one place a password is checked. A cloud-backed store swaps the body of
// this function (and nothing else) for the API call.
export function verifyMasterPassword(
  password: unknown,
  credential: MasterPasswordCredential | null,
): boolean {
  if (!credential || typeof password !== "string" || password.length === 0) return false;
  let derived: Buffer;
  try {
    derived = derive(password, Buffer.from(credential.salt, "hex"), credential);
  } catch {
    return false;
  }
  const expected = Buffer.from(credential.hash, "hex");
  // timingSafeEqual throws on a length mismatch, which is itself a "no"
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
