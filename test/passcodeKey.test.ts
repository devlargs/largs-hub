import { describe, expect, it } from "vitest";
import { createKeyring, openKeyring, PBKDF2_ITERATIONS } from "../src/lib/passcodeKey";
import { parseKey, sanitizeKeyring } from "../electron/passcodes/cloudCrypto";

// Few iterations keep the suite fast; the real count is checked separately.
const FAST = 1_000;

describe("passcodeKey", () => {
  it("opens with the password it was made with, and only that one", async () => {
    const { key, keyring } = await createKeyring("correct horse", FAST);
    expect(await openKeyring("correct horse", keyring)).toBe(key);
    expect(await openKeyring("wrong horse", keyring)).toBeNull();
  });

  it("makes a different key and salt every time", async () => {
    const a = await createKeyring("same", FAST);
    const b = await createKeyring("same", FAST);
    expect(a.key).not.toBe(b.key);
    expect(a.keyring.salt).not.toBe(b.keyring.salt);
  });

  it("never puts the key or password in the keyring", async () => {
    const { key, keyring } = await createKeyring("hunter2-password", FAST);
    const stored = JSON.stringify(keyring);
    expect(stored).not.toContain(key);
    expect(stored).not.toContain("hunter2");
  });

  it("produces what main accepts", async () => {
    const { key, keyring } = await createKeyring("pw", FAST);
    expect(parseKey(key)).not.toBeNull();
    expect(sanitizeKeyring({ ...keyring, iterations: PBKDF2_ITERATIONS })).not.toBeNull();
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it("refuses a damaged keyring", async () => {
    const { keyring } = await createKeyring("pw", FAST);
    expect(await openKeyring("pw", { ...keyring, wrappedKey: "AAAA" })).toBeNull();
    expect(await openKeyring("pw", { ...keyring, iv: "!!" })).toBeNull();
  });
});
