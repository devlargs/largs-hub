import { getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { decideReconcile } from "../cloudReconcile";
import type { WorkspaceChoice } from "../../store/cloud";
import {
  cloud,
  engine,
  hasSyncedBefore,
  MAX_WORKSPACE_BYTES,
  offlineOr,
  PUSH_TIMEOUT_MS,
  recordSynced,
  setState,
  signOutOfCloud,
  userRef,
  withTimeout,
  type Session,
} from "./core";

// The workspace half of the engine: the first sync after taking the session,
// pushing local changes, and taking changes another computer wrote. Main owns
// the workspace, so this only reads it through exportWorkspace and writes it
// through applyWorkspace, which checks it.

// The first sync after taking the session: seed the account, take its
// workspace, or ask which one to keep.
export async function reconcile(s: Session): Promise<void> {
  if (s.reconciling || s.closed) return;
  s.reconciling = true;
  try {
    const snap = await getDoc(userRef(s.uid));
    const local = await cloud().exportWorkspace();
    // Another computer took the session meanwhile: it's theirs to sync
    if (s.closed || s.remoteLocked || !local) return;
    const remote = snap.exists() ? snap.data() : null;
    // Passcodes first, whatever happens to the rest: keeping this computer's
    // workspace below must still keep the passcodes saved from elsewhere, and
    // any saved here before signing in join them (passcodes/index.ts)
    await cloud().seedPasscodes(remote?.workspace?.passcodeVault ?? null);
    let action = decideReconcile({
      cloudDocExists: !!remote?.workspace,
      syncedBefore: hasSyncedBefore(s.uid),
      localServiceCount: local.workspace.services.length,
    });
    if (action === "ask") {
      const choice = await askWorkspaceChoice(remote?.updatedByDeviceName || "another computer");
      if (s.closed || s.remoteLocked) return;
      if (choice === "cancel") {
        await signOutOfCloud();
        return;
      }
      action = choice === "cloud" ? "apply" : "push";
    }
    if (action === "apply" && remote) {
      const result = await cloud().applyWorkspace(remote.workspace);
      if (!result.ok) {
        console.error("[cloud] Couldn't apply the account's workspace:", result.error);
        setState({ status: "error", error: result.error });
        return;
      }
      recordSynced(s.uid);
    }
    if (s.closed || s.remoteLocked) return;
    s.reconciled = true;
    await cloud().setSyncEnabled(true);
    if (action === "push") await push(true);
  } catch (error) {
    console.warn("[cloud] Couldn't reach the account's workspace:", error);
    offlineOr("Couldn't reach your account.");
  } finally {
    s.reconciling = false;
  }
}

function askWorkspaceChoice(fromDevice: string): Promise<WorkspaceChoice> {
  return new Promise((resolve) => {
    setState({
      choice: {
        fromDevice,
        resolve: (choice) => {
          setState({ choice: null });
          resolve(choice);
        },
      },
    });
  });
}

// Changes another computer wrote while this one is active. With one active
// computer at a time that's rare (a last push racing the lock), but it's theirs.
export function watchWorkspace(s: Session): Unsubscribe {
  return onSnapshot(
    userRef(s.uid),
    (snap) => {
      if (s.closed || !s.reconciled || s.remoteLocked) return;
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      const data = snap.data();
      if (!data?.workspace || data.updatedByDeviceId === s.device.deviceId) return;
      void cloud()
        .applyWorkspace(data.workspace)
        .then((result) => {
          if (result.ok) recordSynced(s.uid);
        });
    },
    (error) => console.warn("[cloud] Workspace listener failed:", error),
  );
}

export async function push(force: boolean): Promise<void> {
  const s = engine.session;
  if (!s || s.closed || !s.reconciled || s.remoteLocked) return;
  if (s.pushing) {
    s.dirty = true;
    return;
  }
  if (!navigator.onLine) {
    s.dirty = true;
    setState({ status: "offline" });
    return;
  }
  s.pushing = true;
  s.dirty = false;
  let pushed = false;
  setState({ status: "syncing" });
  try {
    const exported = await cloud().exportWorkspace();
    if (!exported || s.closed) return;
    if (JSON.stringify(exported.workspace).length > MAX_WORKSPACE_BYTES) {
      console.error("[cloud] Workspace is over the sync size limit; not pushed.");
      setState({ status: "error", error: "Your workspace is too large to sync." });
      return;
    }
    await withTimeout(
      setDoc(userRef(s.uid), {
        schemaVersion: 1,
        workspace: exported.workspace,
        updatedAt: serverTimestamp(),
        updatedByDeviceId: s.device.deviceId,
        updatedByDeviceName: s.device.deviceName,
      }),
      PUSH_TIMEOUT_MS,
    );
    await cloud().markSynced(exported.fingerprint);
    recordSynced(s.uid);
    pushed = true;
  } catch (error) {
    console.warn("[cloud] Push failed:", error);
    s.dirty = true;
    offlineOr("Couldn't save your workspace to your account.");
  } finally {
    s.pushing = false;
  }
  // A change that came in during a successful push goes straight after it.
  // A failed one waits for the next change, Sync now, or the network.
  if (pushed && s.dirty && !s.closed) void push(force);
}
