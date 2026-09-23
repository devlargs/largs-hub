import { BrowserWindow, ipcMain, powerMonitor, WebContentsView } from "electron";
import { store } from "../store";
import {
  hashMasterPassword,
  sanitizeCredential,
  validateNewPassword,
  verifyMasterPassword,
} from "../masterPassword";
import {
  INITIAL_LOCK_STATE,
  INITIAL_THROTTLE,
  LockEvent,
  LockState,
  msUntilLock,
  reduceLock,
  registerFailure,
  sanitizeLockDelayMinutes,
  sanitizeThrottle,
  throttleMessage,
  throttleWaitMs,
} from "../lockPolicy";
import type { SecurityResult, SecurityState, SecurityUpdate } from "../shared/types";
import { isFromApp } from "../appOrigin";

// IPC: the workspace lock (issue #102) — the "Add Security Controls" toggle,
// the master password, the auto-lock countdown and the lock screen's unlock.
//
// The countdown lives here in the main process, driven by the window's own
// minimize / restore / focus events, so it is unaffected by the renderer being
// backgrounded or a service being hibernated. The decision itself is in
// lockPolicy.ts (pure, unit-tested); this file only holds the timer, the store
// and the window wiring.

interface SecurityIpcDeps {
  getUiView(): WebContentsView | null;
  // Called whenever the lock opens or closes so the main process can hide the
  // service views behind the lock screen.
  onLockedChanged(locked: boolean): void;
}

let deps: SecurityIpcDeps | null = null;
let lockState: LockState = INITIAL_LOCK_STATE;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

function credential() {
  return sanitizeCredential(store.get("masterPasswordCredential"));
}

function lockOptions() {
  return {
    // A toggle switched on but never given a password can't lock anything.
    enabled: store.get("securityControlsEnabled") === true && credential() !== null,
    delayMinutes: sanitizeLockDelayMinutes(store.get("lockDelayMinutes")),
  };
}

function securityState(): SecurityState {
  return {
    enabled: store.get("securityControlsEnabled") === true,
    hasPassword: credential() !== null,
    lockDelayMinutes: sanitizeLockDelayMinutes(store.get("lockDelayMinutes")),
    locked: lockState.locked,
  };
}

// One password check at a time. scrypt is async now, so without this a burst
// of parallel attempts would all read the throttle before any of them had
// recorded a failure, and slip past it.
let checkInFlight = false;

/**
 * The one gate every password goes through: unlocking, turning the lock off
 * and changing the password. Refuses unchecked while the throttle is blocking,
 * records a wrong password, and clears the throttle on a right one.
 */
async function checkPassword(password: unknown, wrongMessage: string): Promise<SecurityResult> {
  if (checkInFlight) return { ok: false, error: "Still checking the last attempt." };
  const now = Date.now();
  const throttle = sanitizeThrottle(store.get("unlockThrottle"), now);
  const wait = throttleWaitMs(throttle, now);
  if (wait > 0) return { ok: false, error: throttleMessage(wait), retryAfterMs: wait };

  checkInFlight = true;
  try {
    if (await verifyMasterPassword(password, credential())) {
      store.set("unlockThrottle", INITIAL_THROTTLE);
      return { ok: true };
    }
    const next = registerFailure(throttle, Date.now());
    store.set("unlockThrottle", next);
    const nextWait = throttleWaitMs(next, Date.now());
    return nextWait > 0
      ? { ok: false, error: throttleMessage(nextWait), retryAfterMs: nextWait }
      : { ok: false, error: wrongMessage };
  } finally {
    checkInFlight = false;
  }
}

function broadcast() {
  deps?.getUiView()?.webContents.send("security-state-changed", securityState());
}

function clearTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}

// Single place the state is replaced, so the timer, the UI and the service
// views can never disagree with it.
function setLockState(next: LockState) {
  const wasLocked = lockState.locked;
  lockState = next;

  clearTimer();
  const remaining = msUntilLock(lockState, Date.now(), lockOptions());
  if (remaining !== null) {
    lockTimer = setTimeout(() => handleLockEvent("elapsed"), remaining);
  }

  if (lockState.locked !== wasLocked) {
    deps?.onLockedChanged(lockState.locked);
  }
  broadcast();
}

function handleLockEvent(event: LockEvent) {
  setLockState(reduceLock(lockState, event, Date.now(), lockOptions()));
}

// Called from main.ts once the window exists. Hiding to the tray is the same
// thing as minimizing as far as the lock is concerned — close-to-tray users
// would otherwise never arm the countdown.
export function attachSecurityWindowEvents(window: BrowserWindow) {
  window.on("minimize", () => handleLockEvent("away"));
  window.on("hide", () => handleLockEvent("away"));
  window.on("restore", () => handleLockEvent("back"));
  window.on("show", () => handleLockEvent("back"));
  window.on("focus", () => handleLockEvent("back"));

  // Locking the PC locks the workspace with it — no countdown, so whatever is
  // on screen is already behind the password by the time the machine unlocks.
  // powerMonitor is unavailable before app-ready on some platforms, and the
  // lock is a nicety rather than something worth failing startup over.
  try {
    powerMonitor.on("lock-screen", () => handleLockEvent("session-locked"));
  } catch (error) {
    console.error("Failed to watch the OS lock screen:", error);
  }
}

export function registerSecurityIpc(d: SecurityIpcDeps) {
  deps = d;

  // A fresh launch always starts at the password screen, however the app was
  // last left (issue #102).
  if (lockOptions().enabled) {
    lockState = { armedAt: null, locked: true };
    deps.onLockedChanged(true);
  }

  ipcMain.handle("get-security-state", (): SecurityState => securityState());

  // Every handler that changes the lock only answers the app's own page
  // (issue #112), and none of them does anything while the workspace is
  // locked: from behind the lock screen the only way forward is unlock-app
  // (issue #111).

  // Switching the toggle off needs the current password, or anyone at an
  // unlocked window could turn the lock off. It leaves the credential in
  // place, so switching it back on asks for nothing.
  ipcMain.handle(
    "set-security-enabled",
    async (event, enabled: unknown, currentPassword: unknown): Promise<SecurityUpdate> => {
      const refuse = (error?: string): SecurityUpdate => ({
        ok: false,
        ...(error ? { error } : {}),
        state: securityState(),
      });
      if (!isFromApp(event) || typeof enabled !== "boolean") return refuse();
      if (lockState.locked) return refuse("Unlock the workspace first.");
      const turningOff =
        !enabled && store.get("securityControlsEnabled") === true && credential() !== null;
      if (turningOff) {
        const checked = await checkPassword(currentPassword, "That isn't your current password.");
        if (!checked.ok) return { ...checked, state: securityState() };
      }
      store.set("securityControlsEnabled", enabled);
      setLockState(enabled ? { armedAt: null, locked: false } : INITIAL_LOCK_STATE);
      return { ok: true, state: securityState() };
    },
  );

  ipcMain.handle("set-lock-delay", (event, minutes: unknown): SecurityState => {
    if (!isFromApp(event) || lockState.locked) return securityState();
    store.set("lockDelayMinutes", sanitizeLockDelayMinutes(minutes));
    // Re-arms the pending countdown against the new delay.
    setLockState(lockState);
    return securityState();
  });

  // Used both to set the first password (currentPassword ignored, since there
  // is nothing to check against) and to change an existing one.
  ipcMain.handle(
    "set-master-password",
    async (
      event,
      payload: { currentPassword?: unknown; password?: unknown; confirm?: unknown },
    ): Promise<SecurityResult> => {
      if (!isFromApp(event)) return { ok: false, error: "Not allowed." };
      if (lockState.locked) return { ok: false, error: "Unlock the workspace first." };
      // Checked before the current password, so a typo in the new one doesn't
      // cost a throttled attempt.
      const invalid = validateNewPassword(payload?.password, payload?.confirm);
      if (invalid) return { ok: false, error: invalid };
      if (credential()) {
        const checked = await checkPassword(
          payload?.currentPassword,
          "That isn't your current password.",
        );
        if (!checked.ok) return checked;
      }

      store.set("masterPasswordCredential", await hashMasterPassword(payload!.password as string));
      store.set("securityControlsEnabled", true);
      setLockState({ armedAt: null, locked: false });
      return { ok: true };
    },
  );

  ipcMain.handle("unlock-app", async (event, password: unknown): Promise<SecurityResult> => {
    if (!isFromApp(event)) return { ok: false, error: "Not allowed." };
    if (!lockState.locked) return { ok: true };
    const checked = await checkPassword(password, "Wrong password.");
    if (!checked.ok) return checked;
    setLockState({ armedAt: null, locked: false });
    return { ok: true };
  });
}
