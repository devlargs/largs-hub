import type {
  CloudPasscodeKeyring,
  CloudPasscodeVault,
  PasscodeAccountState,
} from "../shared/types";
import { keyCrypto, open, sameKeyring, seal } from "./cloudCrypto";
import {
  createPasscodeVault,
  sanitizeStoredPasscodes,
  type PasscodeVault,
  type StoredPasscode,
} from "./vault";

// Passcodes while signed in: they live in the account, never on this
// computer's disk. The list is held in memory, each passcode still encrypted
// (under the account key instead of the OS), and the whole list is sealed into
// the workspace's passcodeVault for the account. Pure, so the state handling
// is unit-tested (test/cloudPasscodes.test.ts); passcodes/index.ts wires it in.
//
// The account copy is last-writer-wins like the rest of the workspace.

export interface CloudPasscodes {
  /** The list as a PasscodeVault: what Settings, the menus and Copy use. */
  vault: PasscodeVault;
  state(): PasscodeAccountState;
  hasKey(): boolean;
  keyring(): CloudPasscodeKeyring | null;
  /** The account's copy, from the first sync or a change made elsewhere. */
  seed(remote: CloudPasscodeVault | null): void;
  /**
   * The key the renderer unwrapped with the account password. False when it
   * doesn't open the account's copy. `startOver` drops a copy no key can open.
   */
  setKey(key: Buffer, keyring: CloudPasscodeKeyring, startOver?: boolean): boolean;
  /** What goes to the account: the sealed list, or the account's copy untouched. */
  exportVault(): CloudPasscodeVault | null;
  /** Passcodes from this computer's own store, moving into the account. */
  importLocal(entries: ReadonlyArray<StoredPasscode & { plain: string }>): void;
  /** Signed out: forget everything. */
  clear(): void;
}

export function createCloudPasscodes(options: {
  onChange: () => void;
  newId: () => string;
  now?: () => number;
}): CloudPasscodes {
  let key: Buffer | null = null;
  let ring: CloudPasscodeKeyring | null = null;
  // undefined until the account's copy has been seen
  let remote: CloudPasscodeVault | null | undefined = undefined;
  // null while locked (no key, or a key that doesn't fit)
  let list: StoredPasscode[] | null = null;
  // The sealed list, kept so an unchanged list exports the same bytes and the
  // workspace's fingerprint doesn't change on every read
  let sealed: string | null = null;

  const changed = () => {
    sealed = null;
    options.onChange();
  };

  const readList = (k: Buffer, data: string): StoredPasscode[] | null => {
    const text = open(k, data);
    if (text === null) return null;
    try {
      return sanitizeStoredPasscodes(JSON.parse(text));
    } catch {
      return null;
    }
  };

  const unlocked = () => key !== null && list !== null;

  const vault = createPasscodeVault({
    read: () => list ?? [],
    write: (next) => {
      if (list === null) return;
      list = next;
      changed();
    },
    crypto: {
      isEncryptionAvailable: unlocked,
      encryptString: (value) => keyCrypto(key!).encryptString(value),
      decryptString: (buffer) => {
        if (!key) throw new Error("Passcodes are locked");
        return keyCrypto(key).decryptString(buffer);
      },
    },
    newId: options.newId,
    now: options.now,
  });

  return {
    vault,
    state: () => (remote === undefined ? "waiting" : unlocked() ? "ready" : "needs-password"),
    hasKey: () => key !== null,
    keyring: () => ring,

    seed(next) {
      // The same account copy as last time (the first sync seeds before it
      // applies the workspace): nothing new, and re-reading it would throw away
      // passcodes moved in from this computer since
      if (remote && next && remote.data === next.data && sameKeyring(remote.keyring, next.keyring))
        return;
      remote = next;
      if (next === null) {
        // Nothing in the account yet: with a key, start (or keep) a list
        if (key) list = list ?? [];
        sealed = null;
        return;
      }
      const opened = key ? readList(key, next.data) : null;
      if (opened) {
        list = opened;
        ring = next.keyring;
        sealed = next.data;
      } else {
        // No key, or the account's passcodes were re-keyed elsewhere (a reset
        // password): locked until the account password unlocks them again
        key = null;
        list = null;
        sealed = null;
      }
    },

    setKey(nextKey, nextRing, startOver = false) {
      if (remote && !startOver) {
        const opened = readList(nextKey, remote.data);
        if (!opened) return false;
        key = nextKey;
        ring = nextRing;
        list = opened;
        sealed = remote.data;
        return true;
      }
      key = nextKey;
      ring = nextRing;
      if (remote === undefined) return true; // checked against the account's copy at seed
      list = startOver ? [] : (list ?? []);
      changed();
      return true;
    },

    exportVault() {
      if (key && ring && list !== null) {
        sealed ??= seal(key, JSON.stringify(list));
        return { keyring: ring, data: sealed };
      }
      return remote ?? null;
    },

    importLocal(entries) {
      if (!key || list === null || entries.length === 0) return;
      const ids = new Set(list.map((p) => p.id));
      const moved = entries
        .filter((e) => !ids.has(e.id))
        .map(({ plain, ...entry }) => ({ ...entry, secret: `enc:${seal(key!, plain)}` }));
      if (moved.length === 0) return;
      list = [...list, ...moved];
      changed();
    },

    clear() {
      key = null;
      ring = null;
      remote = undefined;
      list = null;
      sealed = null;
    },
  };
}
