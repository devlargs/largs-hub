import { describe, expect, it } from "vitest";
import { TokenCrypto, createTokenStore } from "../electron/github/token";

// A stand-in for safeStorage: "encrypts" by reversing, so the stored value is
// visibly not the token.
const reversing: TokenCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from([...value].reverse().join("")),
  decryptString: (buffer) => [...buffer.toString()].reverse().join(""),
};

function setup(crypto: TokenCrypto = reversing, initial: unknown = null) {
  let stored: unknown = initial;
  const tokens = createTokenStore({
    read: () => stored,
    write: (value) => {
      stored = value;
    },
    crypto,
  });
  return { tokens, stored: () => stored };
}

describe("createTokenStore", () => {
  it("round-trips a token without storing it in the clear", () => {
    const { tokens, stored } = setup();
    expect(tokens.save("github_pat_abc")).toBe(true);
    expect(stored()).toMatch(/^enc:/);
    expect(String(stored())).not.toContain("github_pat_abc");
    expect(tokens.load()).toBe("github_pat_abc");
  });

  it("refuses to save when the system can't encrypt", () => {
    const { tokens, stored } = setup({ ...reversing, isEncryptionAvailable: () => false });
    expect(tokens.save("github_pat_abc")).toBe(false);
    expect(stored()).toBeNull();
  });

  it("treats a value that won't decrypt as no token", () => {
    const failing: TokenCrypto = {
      ...reversing,
      decryptString: () => {
        throw new Error("wrong key");
      },
    };
    const { tokens } = setup(failing, "enc:AAAA");
    expect(tokens.load()).toBeNull();
  });

  it("ignores anything not written by it", () => {
    expect(setup(reversing, "github_pat_plain").tokens.load()).toBeNull();
    expect(setup(reversing, 42).tokens.load()).toBeNull();
    expect(setup().tokens.load()).toBeNull();
  });

  it("forgets the token on clear", () => {
    const { tokens } = setup();
    tokens.save("github_pat_abc");
    tokens.clear();
    expect(tokens.load()).toBeNull();
  });
});
