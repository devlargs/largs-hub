// The sync engine's decisions that don't need Firebase: whether to take the
// session at sign-in, what to do with the account's workspace the first time,
// and the status line. Pure (test/cloudReconcile.test.ts); cloudSync.ts acts on
// them.

export type ReconcileAction = "push" | "apply" | "ask";

/**
 * What to do with the account's workspace when this computer takes the
 * session. Only one computer is active at a time, so the cloud copy wins once
 * this one has synced with the account before.
 */
export function decideReconcile(params: {
  cloudDocExists: boolean;
  syncedBefore: boolean;
  localServiceCount: number;
}): ReconcileAction {
  // The first computer seeds the account
  if (!params.cloudDocExists) return "push";
  if (params.syncedBefore) return "apply";
  // Nothing here to lose
  if (params.localServiceCount === 0) return "apply";
  return "ask";
}

/**
 * Whether signing in takes the session. A launch the OS made at sign-in
 * doesn't take it from another computer that has it: that one is probably
 * the computer you're using.
 */
export function shouldClaimOnStart(params: {
  activeDeviceId: string | null | undefined;
  myDeviceId: string;
  // The user just submitted the sign-in or create-account form
  interactive: boolean;
  launchedAtLogin: boolean;
}): boolean {
  if (!params.activeDeviceId || params.activeDeviceId === params.myDeviceId) return true;
  return params.interactive || !params.launchedAtLogin;
}

export type CloudStatus =
  "disabled" | "signed-out" | "signing-in" | "syncing" | "synced" | "offline" | "error";

/** "Last synced 2 min ago" and friends, for Settings → Account. */
export function syncStatusLabel(
  state: { status: CloudStatus; lastSyncedAt?: number; error?: string },
  now: number,
): string {
  switch (state.status) {
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline. Changes will sync when you're back online.";
    case "error":
      return `Sync error: ${state.error ?? "something went wrong."}`;
    case "synced":
      return state.lastSyncedAt ? `Last synced ${timeAgo(state.lastSyncedAt, now)}` : "Up to date";
    case "signing-in":
      return "Signing in…";
    default:
      return "";
  }
}

function timeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
