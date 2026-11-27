import { signOut } from "firebase/auth";
import {
  doc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type FieldValue,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import type { CloudDeviceInfo, CloudSessionDocFields, CloudWorkspaceDocFields } from "../../types";
import { getFirebase } from "../firebase";
import { useCloudStore } from "../../store/cloud";

// What the sync engine's modules share: the Firestore docs and their refs, the
// engine's state, and small helpers.
//
// Two Firestore docs per account, nothing else (the security rules allow only
// these, and no subcollections): users/{uid} holds the workspace,
// sessions/{uid} says which computer is using the account.

export const MAX_WORKSPACE_BYTES = 900_000;
export const CLAIM_TIMEOUT_MS = 10_000;
export const PUSH_TIMEOUT_MS = 20_000;
const RELEASE_TIMEOUT_MS = 3_000;

// The Firestore docs as stored: the shared fields plus the server timestamps,
// which only the renderer knows about.
export interface CloudWorkspaceDoc extends CloudWorkspaceDocFields {
  updatedAt: Timestamp | FieldValue;
}
export interface CloudSessionDoc extends CloudSessionDocFields {
  claimedAt: Timestamp | FieldValue;
}

export interface Session {
  uid: string;
  device: CloudDeviceInfo;
  unsubscribers: Unsubscribe[];
  closed: boolean;
  // This computer has written itself into sessions/{uid}
  claimed: boolean;
  remoteLocked: boolean;
  // The workspace has been reconciled with the account; until then nothing is
  // pushed, so a stale local copy can't overwrite the account's.
  reconciled: boolean;
  reconciling: boolean;
  pushing: boolean;
  // A change is waiting to be pushed (offline, or arrived mid-push)
  dirty: boolean;
}

// The engine's one piece of state: the signed-in account's session, if any.
// `generation` counts sign-in changes, so a slow start for one account can't
// install itself after the next change has already happened.
export const engine: { session: Session | null; interactiveSignIn: boolean; generation: number } = {
  session: null,
  interactiveSignIn: false,
  generation: 0,
};

export const cloud = () => window.electronAPI.cloud;
export const setState = useCloudStore.setState;

export const userRef = (uid: string) =>
  doc(getFirebase().db, "users", uid) as DocumentReference<CloudWorkspaceDoc>;
export const sessionRef = (uid: string) =>
  doc(getFirebase().db, "sessions", uid) as DocumentReference<CloudSessionDoc>;

// Per account, on this computer: whether it has synced with the account
// before (so the cloud copy wins without asking), and when it last did.
export const syncedKey = (uid: string) => `largs-hub.cloud.synced.${uid}`;
export const hasSyncedBefore = (uid: string) => localStorage.getItem(syncedKey(uid)) !== null;
export function recordSynced(uid: string) {
  const now = Date.now();
  localStorage.setItem(syncedKey(uid), String(now));
  setState({ status: "synced", lastSyncedAt: now, error: undefined });
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function offlineOr(error: string) {
  if (!navigator.onLine) setState({ status: "offline" });
  else setState({ status: "error", error });
}

/**
 * Signs out on this computer. Lets go of the session first if this computer
 * has it (best effort: offline it's skipped). The workspace stays as it is.
 */
export async function signOutOfCloud(): Promise<void> {
  const s = engine.session;
  if (s && s.claimed && !s.remoteLocked) {
    try {
      await withTimeout(
        setDoc(sessionRef(s.uid), {
          activeDeviceId: null,
          activeDeviceName: "",
          activePlatform: "",
          claimedAt: serverTimestamp(),
        }),
        RELEASE_TIMEOUT_MS,
      );
    } catch {
      // offline: the next computer to sign in takes the session anyway
    }
  }
  await signOut(getFirebase().auth);
}
