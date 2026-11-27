import { create } from "zustand";
import type { CloudStatus } from "../lib/cloudReconcile";
import type { RemoteLockInfo } from "../types";
import { firebaseEnabled } from "../lib/firebaseEnv";

// The account and sync state the Account section, the remote lock screen and
// the workspace-choice dialog read. Written only by src/lib/cloudSync.ts.

export type WorkspaceChoice = "cloud" | "local" | "cancel";

interface CloudState {
  status: CloudStatus;
  email?: string;
  // "<hostname> (Windows)"
  deviceName?: string;
  lastSyncedAt?: number;
  error?: string;
  remoteLock?: RemoteLockInfo;
  // The one-time "this account already has a workspace" question, while open
  choice: { fromDevice: string; resolve: (choice: WorkspaceChoice) => void } | null;
}

export const useCloudStore = create<CloudState>(() => ({
  status: firebaseEnabled ? "signing-in" : "disabled",
  choice: null,
}));
