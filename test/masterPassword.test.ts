import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  hashMasterPassword,
  sanitizeCredential,
  validateNewPassword,
  verifyMasterPassword,
} from "../electron/masterPassword";

describe("validateNewPassword", () => {
  it("accepts a long enough matching pair", () => {
    expect(validateNewPassword("hunter2!", "hunter2!")).toBeNull();
  });

  it("rejects an empty password", () => {
    expect(validateNewPassword("", "")).toBe("Enter a password.");
    expect(validateNewPassword(undefined, undefined)).toBe("Enter a password.");
  });

  it("asks for at least six characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
    expect(validateNewPassword("12345", "12345")).toBe("Use at least 6 characters.");
    expect(validateNewPassword("123456", "123456")).toBeNull();
  });

  it("rejects one that is too short", () => {
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1), "a")).toMatch(/at least/);
  });

  it("rejects a mismatched confirmation", () => {
    expect(validateNewPassword("hunter2!", "hunter3!")).toBe("The two passwords don't match.");
  });
});

describe("hashMasterPassword / verifyMasterPassword", async () => {
  it("never stores the password itself", async () => {
    const credential = await hashMasterPassword("hunter2!");
    expect(JSON.stringify(credential)).not.toContain("hunter2!");
  });

  it("salts, so the same password hashes differently each time", async () => {
    expect((await hashMasterPassword("hunter2!")).hash).not.toBe(
      (await hashMasterPassword("hunter2!")).hash,
    );
  });

  it("accepts the right password and refuses everything else", async () => {
    const credential = await hashMasterPassword("hunter2!");
    expect(await verifyMasterPassword("hunter2!", credential)).toBe(true);
    expect(await verifyMasterPassword("hunter2", credential)).toBe(false);
    expect(await verifyMasterPassword("Hunter2!", credential)).toBe(false);
    expect(await verifyMasterPassword("", credential)).toBe(false);
    expect(await verifyMasterPassword(null, credential)).toBe(false);
    expect(await verifyMasterPassword(12345, credential)).toBe(false);
  });

  it("refuses when there is no credential to check against", async () => {
    expect(await verifyMasterPassword("hunter2!", null)).toBe(false);
  });

  it("survives a corrupted stored hash rather than throwing", async () => {
    const credential = { ...(await hashMasterPassword("hunter2!")), hash: "00" };
    expect(await verifyMasterPassword("hunter2!", credential)).toBe(false);
  });
});

describe("sanitizeCredential", async () => {
  it("passes a credential it produced itself", async () => {
    const credential = await hashMasterPassword("hunter2!");
    expect(sanitizeCredential(JSON.parse(JSON.stringify(credential)))).toEqual(credential);
  });

  it("rejects anything that isn't a credential", async () => {
    for (const value of [null, undefined, "hunter2!", 42, [], {}]) {
      expect(sanitizeCredential(value)).toBeNull();
    }
  });

  it("rejects fields that would throw or stall inside scrypt", async () => {
    const base = await hashMasterPassword("hunter2!");
    expect(sanitizeCredential({ ...base, algorithm: "md5" })).toBeNull();
    expect(sanitizeCredential({ ...base, salt: "zzz" })).toBeNull();
    expect(sanitizeCredential({ ...base, salt: "" })).toBeNull();
    expect(sanitizeCredential({ ...base, hash: "nothex" })).toBeNull();
    expect(sanitizeCredential({ ...base, keyLength: 0 })).toBeNull();
    expect(sanitizeCredential({ ...base, cost: 1e12 })).toBeNull();
    expect(sanitizeCredential({ ...base, blockSize: 1.5 })).toBeNull();
    expect(sanitizeCredential({ ...base, parallelization: -1 })).toBeNull();
  });

  it("round-trips a sanitized credential back into a successful verify", async () => {
    const credential = sanitizeCredential(await hashMasterPassword("hunter2!"));
    expect(await verifyMasterPassword("hunter2!", credential)).toBe(true);
  });
});

describe("verifyMasterPassword off the main thread", () => {
  it("returns a promise instead of blocking the caller", async () => {
    const credential = await hashMasterPassword("hunter2!");
    let settled = false;
    const pending = verifyMasterPassword("hunter2!", credential).then((ok) => {
      settled = true;
      return ok;
    });
    // Synchronous scrypt would have finished before this line ran.
    expect(settled).toBe(false);
    expect(await pending).toBe(true);
  });
});
