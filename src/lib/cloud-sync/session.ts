import { onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { decideRemoteLock } from "@shared/remoteSession";
import type { RemoteLockInfo } from "../../types";
import { useCloudStore } from "../../store/cloud";
import { cloud, hasSyncedBefore, sessionRef, setState, type Session } from "./core";
import { reconcile } from "./workspace";

// The session half of the engine: which computer has the account. Any other
// one is locked by main (setRemoteLock) until it takes the session back.

export function claimSession(s: Session): Promise<void> {
  s.claimed = true;
  return setDoc(sessionRef(s.uid), {
    activeDeviceId: s.device.deviceId,
    activeDeviceName: s.device.deviceName,
    activePlatform: s.device.platform,
    claimedAt: serverTimestamp(),
  });
}

// Locks this computer while another one has the session, and takes the
// workspace back when this one gets it again.
export function watchSession(s: Session): Unsubscribe {
  return onSnapshot(
    sessionRef(s.uid),
    { includeMetadataChanges: true },
    (snap) => {
      if (s.closed) return;
      const data = snap.data();
      const decision = decideRemoteLock({
        session: data
          ? {
              activeDeviceId: data.activeDeviceId ?? null,
              activeDeviceName: data.activeDeviceName,
              activePlatform: data.activePlatform,
            }
          : null,
        myDeviceId: s.device.deviceId,
        fromCache: snap.metadata.fromCache,
        now: Date.now(),
      });
      if (decision.action === "lock") lockHere(s, decision.info);
      else if (
        decision.action === "unlock" &&
        (s.remoteLocked || (!s.reconciled && !s.reconciling))
      ) {
        void takeOver(s, data?.activeDeviceId === s.device.deviceId);
      }
    },
    (error) => console.warn("[cloud] Session listener failed:", error),
  );
}

function lockHere(s: Session, info: RemoteLockInfo) {
  const current = useCloudStore.getState().remoteLock;
  if (
    s.remoteLocked &&
    current?.deviceName === info.deviceName &&
    current.platform === info.platform
  ) {
    return;
  }
  const since = s.remoteLocked && current ? current.since : info.since;
  s.remoteLocked = true;
  s.reconciled = false;
  s.claimed = false;
  void cloud().setSyncEnabled(false);
  void cloud().setRemoteLock({ ...info, since });
  setState({ remoteLock: { ...info, since } });
}

// The session is free or ours: pull the account's workspace, then unlock.
async function takeOver(s: Session, alreadyOurs: boolean) {
  s.remoteLocked = false;
  // The other computer let go (signed out): take the session
  if (!alreadyOurs) {
    claimSession(s).catch((error) => console.warn("[cloud] Couldn't take the session:", error));
  }
  // The first sync with this account may need to ask which workspace to keep,
  // and that question can't show behind the lock screen.
  const unlockFirst = !hasSyncedBefore(s.uid);
  if (unlockFirst) await clearRemoteLock();
  await reconcile(s);
  if (!unlockFirst && !s.remoteLocked) await clearRemoteLock();
}

async function clearRemoteLock() {
  await cloud().setRemoteLock(null);
  setState({ remoteLock: undefined });
}
