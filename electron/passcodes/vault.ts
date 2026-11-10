import type { Passcode, PasscodeDraft } from "../shared/types";

// Saved passcodes: the store-facing logic, free of Electron imports so it is
// unit-tested (test/passcodeVault.test.ts). passcodes/index.ts wires in the
// store and safeStorage, which encrypts with DPAPI on Windows and the Keychain
// on macOS.
//
// Only the passcode is encrypted. The label and username are what Settings and
// the right-click menu list, the same split a browser's saved-passwords list
// makes. A passcode is never stored in the clear: when the OS can't encrypt,
// saving is refused.

const ENC_PREFIX = "enc:";

export const MAX_PASSCODES = 200;
export const MAX_LABEL_LENGTH = 80;
export const MAX_USERNAME_LENGTH = 200;
export const MAX_SECRET_LENGTH = 1000;

export interface PasscodeCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buffer: Buffer): string;
}

export interface StoredPasscode extends Passcode {
  // "enc:<base64>" from safeStorage
  secret: string;
}

export type SaveResult = { ok: true; passcode: Passcode } | { ok: false; error: string };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

// The stored JSON is user-writable, so anything malformed is dropped rather
// than handed to the menu or the settings list.
export function sanitizeStoredPasscodes(raw: unknown): StoredPasscode[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredPasscode[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as Record<string, unknown>;
    if (!isNonEmptyString(p.id) || seen.has(p.id)) continue;
    if (!isNonEmptyString(p.label)) continue;
    if (typeof p.secret !== "string" || !p.secret.startsWith(ENC_PREFIX)) continue;
    seen.add(p.id);
    out.push({
      id: p.id,
      label: p.label.slice(0, MAX_LABEL_LENGTH),
      username: typeof p.username === "string" ? p.username.slice(0, MAX_USERNAME_LENGTH) : "",
      serviceId: isNonEmptyString(p.serviceId) ? p.serviceId : null,
      createdAt: typeof p.createdAt === "number" ? p.createdAt : 0,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
      secret: p.secret,
    });
  }
  return out;
}

export function toPublic({ secret: _secret, ...passcode }: StoredPasscode): Passcode {
  return passcode;
}

type DraftCheck =
  | {
      ok: true;
      id: string | null;
      label: string;
      username: string;
      serviceId: string | null;
      secret: string | null;
    }
  | { ok: false; error: string };

/**
 * Checks what Settings sent. `serviceIds` are the services that exist now, so
 * an entry can't be tied to one that was removed while the dialog was open.
 */
export function checkDraft(raw: unknown, serviceIds: readonly string[]): DraftCheck {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Nothing to save." };
  const d = raw as Partial<Record<keyof PasscodeDraft, unknown>>;
  const id = isNonEmptyString(d.id) ? d.id : null;

  const label = typeof d.label === "string" ? d.label.trim() : "";
  if (!label) return { ok: false, error: "Give it a name." };
  if (label.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: `Keep the name under ${MAX_LABEL_LENGTH} characters.` };
  }

  const username = typeof d.username === "string" ? d.username.trim() : "";
  if (username.length > MAX_USERNAME_LENGTH) {
    return { ok: false, error: `Keep the username under ${MAX_USERNAME_LENGTH} characters.` };
  }

  let serviceId: string | null = null;
  if (d.serviceId !== null && d.serviceId !== undefined && d.serviceId !== "") {
    if (typeof d.serviceId !== "string" || !serviceIds.includes(d.serviceId)) {
      return { ok: false, error: "That service no longer exists." };
    }
    serviceId = d.serviceId;
  }

  // The passcode is kept exactly as typed: spaces can be part of one.
  const secret = typeof d.secret === "string" && d.secret.length > 0 ? d.secret : null;
  if (secret !== null && secret.length > MAX_SECRET_LENGTH) {
    return { ok: false, error: `Keep the passcode under ${MAX_SECRET_LENGTH} characters.` };
  }
  if (id === null && secret === null) return { ok: false, error: "Enter the passcode." };

  return { ok: true, id, label, username, serviceId, secret };
}

/**
 * The passcodes offered in a service's right-click menu: the ones tied to that
 * service first, then the ones for every service, each group by name.
 */
export function passcodesForService<T extends Passcode>(
  passcodes: readonly T[],
  serviceId: string,
): T[] {
  const byLabel = (a: T, b: T) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  return [
    ...passcodes.filter((p) => p.serviceId === serviceId).sort(byLabel),
    ...passcodes.filter((p) => p.serviceId === null).sort(byLabel),
  ];
}

export interface PasscodeVault {
  available(): boolean;
  list(): Passcode[];
  save(raw: unknown, serviceIds: readonly string[]): SaveResult;
  remove(id: unknown): boolean;
  /** The decrypted passcode, or null when there's none or it can't be decrypted here. */
  reveal(id: unknown): string | null;
  /** A removed service's passcodes move to "every service" rather than vanish. */
  unlinkService(serviceId: string): void;
}

export function createPasscodeVault(options: {
  read: () => unknown;
  write: (value: StoredPasscode[]) => void;
  crypto: PasscodeCrypto;
  now?: () => number;
  newId: () => string;
}): PasscodeVault {
  const { read, write, crypto, newId } = options;
  const now = options.now ?? Date.now;
  const load = () => sanitizeStoredPasscodes(read());
  const encrypt = (secret: string) => ENC_PREFIX + crypto.encryptString(secret).toString("base64");

  return {
    available: () => crypto.isEncryptionAvailable(),

    list: () => load().map(toPublic),

    save(raw, serviceIds) {
      const draft = checkDraft(raw, serviceIds);
      if (!draft.ok) return draft;
      const stored = load();
      const existing = draft.id ? stored.find((p) => p.id === draft.id) : undefined;
      if (draft.id && !existing) return { ok: false, error: "That passcode no longer exists." };
      if (!existing && stored.length >= MAX_PASSCODES) {
        return { ok: false, error: `You can save up to ${MAX_PASSCODES} passcodes.` };
      }
      if (draft.secret !== null && !crypto.isEncryptionAvailable()) {
        return { ok: false, error: "This computer can't encrypt passcodes right now." };
      }

      let secret: string;
      try {
        secret = draft.secret !== null ? encrypt(draft.secret) : (existing?.secret ?? "");
      } catch {
        return { ok: false, error: "The passcode couldn't be encrypted." };
      }

      const time = now();
      const entry: StoredPasscode = {
        id: existing?.id ?? newId(),
        label: draft.label,
        username: draft.username,
        serviceId: draft.serviceId,
        createdAt: existing?.createdAt ?? time,
        updatedAt: time,
        secret,
      };
      write(existing ? stored.map((p) => (p.id === entry.id ? entry : p)) : [...stored, entry]);
      return { ok: true, passcode: toPublic(entry) };
    },

    remove(id) {
      const stored = load();
      const kept = stored.filter((p) => p.id !== id);
      if (kept.length === stored.length) return false;
      write(kept);
      return true;
    },

    reveal(id) {
      const entry = load().find((p) => p.id === id);
      if (!entry) return null;
      try {
        const secret = crypto.decryptString(
          Buffer.from(entry.secret.slice(ENC_PREFIX.length), "base64"),
        );
        return secret || null;
      } catch {
        // Encrypted under another user account or machine
        return null;
      }
    },

    unlinkService(serviceId) {
      const stored = load();
      if (!stored.some((p) => p.serviceId === serviceId)) return;
      write(stored.map((p) => (p.serviceId === serviceId ? { ...p, serviceId: null } : p)));
    },
  };
}

/**
 * How a passcode is typed into a page: one key press per character, so a PIN
 * split across one-digit boxes (that move focus as you type) fills the same as
 * a single field. Characters outside the Basic Multilingual Plane can't be
 * sent as a single key event, so they are inserted as text instead.
 */
export type TypingStep = { kind: "char"; value: string } | { kind: "insert"; value: string };

export function typingSteps(secret: string): TypingStep[] {
  return Array.from(secret).map((value) =>
    value.length === 1 ? { kind: "char", value } : { kind: "insert", value },
  );
}
