import { onAuthStateChanged, type User } from "firebase/auth";
import { getDoc } from "firebase/firestore";
import { deviceDisplayName } from "@shared/remoteSession";
import { getFirebase } from "../firebase";
import { firebaseEnabled } from "../firebaseEnv";
import { shouldClaimOnStart } from "../cloudReconcile";
import { useCloudStore } from "../../store/cloud";
import type { AuthResult } from "../cloudAuthErrors";
import {
  CLAIM_TIMEOUT_MS,
  cloud,
  engine,
  sessionRef,
  setState,
  syncedKey,
  withTimeout,
  type Session,
} from "./core";
import { push, reconcile, watchWorkspace } from "./workspace";
import { claimSession, watchSession } from "./session";

export { signOutOfCloud } from "./core";

// The sync engine: one controller for the whole app, started from App.tsx
// (useCloudSync), driven by Firebase's sign-in state.
//   core.ts       the Firestore docs, the engine's state, helpers, sign out
//   session.ts    sessions/{uid}: taking the session, the remote lock
//   workspace.ts  users/{uid}: first sync, pushes, changes from elsewhere

/** The user just submitted the form, so this sign-in takes the session. */
export function markInteractiveSignIn(): void {
  engine.interactiveSignIn = true;
}

/** Starts the engine. Returns its teardown. */
export function startCloudSync(): () => void {
  if (!firebaseEnabled) return () => undefined;
  const offAuth = onAuthStateChanged(getFirebase().auth, (user) => void handleUser(user));
  const offChanged = cloud().onWorkspaceChanged(() => void push(false));
  const onOnline = () => void resume();
  const onOffline = () => {
    if (engine.session) setState({ status: "offline" });
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    offAuth();
    offChanged();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    void endSession();
  };
}

async function handleUser(user: User | null) {
  const generation = ++engine.generation;
  await endSession();
  if (!user) {
    engine.interactiveSignIn = false;
    // Main outlives this page (macOS keeps running with the window closed),
    // so a lock from before the page was recreated is cleared here too.
    await cloud().setSyncEnabled(false);
    await cloud().setRemoteLock(null);
    setState({
      status: "signed-out",
      email: undefined,
      error: undefined,
      lastSyncedAt: undefined,
      remoteLock: undefined,
    });
    return;
  }
  const interactive = engine.interactiveSignIn;
  engine.interactiveSignIn = false;

  const device = await cloud().getDeviceInfo();
  if (generation !== engine.generation) return;
  const s: Session = {
    uid: user.uid,
    device,
    unsubscribers: [],
    closed: false,
    claimed: false,
    remoteLocked: false,
    reconciled: false,
    reconciling: false,
    pushing: false,
    dirty: false,
  };
  engine.session = s;
  const last = Number(localStorage.getItem(syncedKey(user.uid))) || undefined;
  setState({
    status: "syncing",
    email: user.email ?? undefined,
    deviceName: deviceDisplayName(device.deviceName, device.platform),
    lastSyncedAt: last,
    error: undefined,
  });

  // Who has the session? Offline there's no knowing: take it unless the OS
  // started this launch, and let the listener sort it out once online.
  let claim = interactive || !device.wasLaunchedAtLogin;
  try {
    const snap = await getDoc(sessionRef(s.uid));
    claim = shouldClaimOnStart({
      activeDeviceId: snap.data()?.activeDeviceId,
      myDeviceId: device.deviceId,
      interactive,
      launchedAtLogin: device.wasLaunchedAtLogin,
    });
  } catch {
    // offline, handled above
  }
  if (s.closed) return;

  if (claim) {
    claimSession(s).catch((error) => console.warn("[cloud] Couldn't take the session:", error));
    await reconcile(s);
  }
  if (s.closed) return;
  s.unsubscribers.push(watchSession(s), watchWorkspace(s));
}

// Back online: finish whatever was waiting on the network.
async function resume() {
  const s = engine.session;
  if (!s || s.closed || s.remoteLocked) return;
  if (s.claimed && !s.reconciled) await reconcile(s);
  else if (s.dirty) await push(false);
  else setState({ status: "synced" });
}

/** Settings → Account → Sync now. */
export async function syncNow(): Promise<void> {
  const s = engine.session;
  if (!s || s.remoteLocked) return;
  if (!s.reconciled) await reconcile(s);
  else await push(true);
}

/** The remote lock screen's "Use Largs Hub here". */
export async function claimSessionHere(): Promise<AuthResult> {
  const s = engine.session;
  if (!s) return { ok: false, error: "You're signed out." };
  try {
    await withTimeout(claimSession(s), CLAIM_TIMEOUT_MS);
    return { ok: true };
  } catch (error) {
    console.warn("[cloud] Couldn't take the session:", error);
    return { ok: false, error: "Can't reach the server. Check your connection." };
  }
}

async function endSession() {
  const s = engine.session;
  if (!s) return;
  s.closed = true;
  engine.session = null;
  for (const unsubscribe of s.unsubscribers) unsubscribe();
  useCloudStore.getState().choice?.resolve("cancel");
  await cloud().setSyncEnabled(false);
  await cloud().setRemoteLock(null);
  setState({ remoteLock: undefined });
}
