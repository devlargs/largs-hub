// The GitHub personal access token used to file issues from the app. Kept only
// in the main process, encrypted by the OS (Electron safeStorage: DPAPI on
// Windows, the Keychain on macOS), and never handed to the renderer.
//
// Storage and crypto are injected so this can be unit-tested
// (test/githubToken.test.ts); ipc/github.ts wires in the store and safeStorage.

const ENC_PREFIX = "enc:";

export interface TokenCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buffer: Buffer): string;
}

export interface TokenStore {
  /** Store `token`. False when it can't be encrypted, rather than keep it in plain text. */
  save(token: string): boolean;
  /** The token, or null when there's none or it can't be decrypted any more. */
  load(): string | null;
  clear(): void;
}

export function createTokenStore(options: {
  read: () => unknown;
  write: (value: string | null) => void;
  crypto: TokenCrypto;
}): TokenStore {
  const { read, write, crypto } = options;
  return {
    save(token) {
      if (!crypto.isEncryptionAvailable()) return false;
      write(ENC_PREFIX + crypto.encryptString(token).toString("base64"));
      return true;
    },
    load() {
      const stored = read();
      if (typeof stored !== "string" || !stored.startsWith(ENC_PREFIX)) return null;
      try {
        const token = crypto.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), "base64"));
        return token || null;
      } catch {
        // Encrypted on another machine or user account: treat as not connected
        return null;
      }
    },
    clear() {
      write(null);
    },
  };
}
