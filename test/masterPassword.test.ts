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

  it("rejects one that is too short", () => {
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1), "a")).toMatch(/at least/);
  });

  it("rejects a mismatched confirmation", () => {
    expect(validateNewPassword("hunter2!", "hunter3!")).toBe("The two passwords don't match.");
  });
});

describe("hashMasterPassword / verifyMasterPassword", () => {
  it("never stores the password itself", () => {
    const credential = hashMasterPassword("hunter2!");
    expect(JSON.stringify(credential)).not.toContain("hunter2!");
  });

  it("salts, so the same password hashes differently each time", () => {
    expect(hashMasterPassword("hunter2!").hash).not.toBe(hashMasterPassword("hunter2!").hash);
  });

  it("accepts the right password and refuses everything else", () => {
    const credential = hashMasterPassword("hunter2!");
    expect(verifyMasterPassword("hunter2!", credential)).toBe(true);
    expect(verifyMasterPassword("hunter2", credential)).toBe(false);
    expect(verifyMasterPassword("Hunter2!", credential)).toBe(false);
    expect(verifyMasterPassword("", credential)).toBe(false);
    expect(verifyMasterPassword(null, credential)).toBe(false);
    expect(verifyMasterPassword(12345, credential)).toBe(false);
  });

  it("refuses when there is no credential to check against", () => {
    expect(verifyMasterPassword("hunter2!", null)).toBe(false);
  });

  it("survives a corrupted stored hash rather than throwing", () => {
    const credential = { ...hashMasterPassword("hunter2!"), hash: "00" };
    expect(verifyMasterPassword("hunter2!", credential)).toBe(false);
  });
});

describe("sanitizeCredential", () => {
  it("passes a credential it produced itself", () => {
    const credential = hashMasterPassword("hunter2!");
    expect(sanitizeCredential(JSON.parse(JSON.stringify(credential)))).toEqual(credential);
  });

  it("rejects anything that isn't a credential", () => {
    for (const value of [null, undefined, "hunter2!", 42, [], {}]) {
      expect(sanitizeCredential(value)).toBeNull();
    }
  });

  it("rejects fields that would throw or stall inside scrypt", () => {
    const base = hashMasterPassword("hunter2!");
    expect(sanitizeCredential({ ...base, algorithm: "md5" })).toBeNull();
    expect(sanitizeCredential({ ...base, salt: "zzz" })).toBeNull();
    expect(sanitizeCredential({ ...base, salt: "" })).toBeNull();
    expect(sanitizeCredential({ ...base, hash: "nothex" })).toBeNull();
    expect(sanitizeCredential({ ...base, keyLength: 0 })).toBeNull();
    expect(sanitizeCredential({ ...base, cost: 1e12 })).toBeNull();
    expect(sanitizeCredential({ ...base, blockSize: 1.5 })).toBeNull();
    expect(sanitizeCredential({ ...base, parallelization: -1 })).toBeNull();
  });

  it("round-trips a sanitized credential back into a successful verify", () => {
    const credential = sanitizeCredential(hashMasterPassword("hunter2!"));
    expect(verifyMasterPassword("hunter2!", credential)).toBe(true);
  });
});
