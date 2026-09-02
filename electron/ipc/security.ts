import { BrowserWindow, ipcMain, WebContentsView } from "electron";
import { store } from "../store";
import {
  hashMasterPassword,
  sanitizeCredential,
  validateNewPassword,
  verifyMasterPassword,
} from "../masterPassword";
import {
  INITIAL_LOCK_STATE,
  LockEvent,
  LockState,
  msUntilLock,
  reduceLock,
  sanitizeLockDelayMinutes,
} from "../lockPolicy";
import type { SecurityResult, SecurityState } from "../shared/types";

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

  // Switching the toggle off leaves the credential in place; switching it back
  // on with a credential already stored asks for nothing.
  ipcMain.handle("set-security-enabled", (_event, enabled: unknown): SecurityState => {
    if (typeof enabled !== "boolean") return securityState();
    store.set("securityControlsEnabled", enabled);
    setLockState(enabled ? { armedAt: null, locked: false } : INITIAL_LOCK_STATE);
    return securityState();
  });

  ipcMain.handle("set-lock-delay", (_event, minutes: unknown): SecurityState => {
    store.set("lockDelayMinutes", sanitizeLockDelayMinutes(minutes));
    // Re-arms the pending countdown against the new delay.
    setLockState(lockState);
    return securityState();
  });

  // Used both to set the first password (currentPassword ignored, since there
  // is nothing to check against) and to change an existing one.
  ipcMain.handle(
    "set-master-password",
    (
      _event,
      payload: { currentPassword?: unknown; password?: unknown; confirm?: unknown },
    ): SecurityResult => {
      const existing = credential();
      if (existing && !verifyMasterPassword(payload?.currentPassword, existing)) {
        return { ok: false, error: "That isn't your current password." };
      }
      const invalid = validateNewPassword(payload?.password, payload?.confirm);
      if (invalid) return { ok: false, error: invalid };

      store.set("masterPasswordCredential", hashMasterPassword(payload!.password as string));
      store.set("securityControlsEnabled", true);
      setLockState({ armedAt: null, locked: false });
      return { ok: true };
    },
  );

  ipcMain.handle("unlock-app", (_event, password: unknown): SecurityResult => {
    if (!lockState.locked) return { ok: true };
    if (!verifyMasterPassword(password, credential())) {
      return { ok: false, error: "Wrong password." };
    }
    setLockState({ armedAt: null, locked: false });
    return { ok: true };
  });
}
