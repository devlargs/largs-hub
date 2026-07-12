// Minimal electron stub for unit tests (aliased in vitest.config.ts).
// Only the pieces that main-process modules touch at import/registration time.

export const ipcMain = {
  handle: () => undefined,
  on: () => undefined,
};

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (buffer: Buffer) => buffer.toString(),
};

// Type-only imports (e.g. Session in badge-adapters) are erased at compile
// time and need no runtime counterpart.
export type Session = unknown;
