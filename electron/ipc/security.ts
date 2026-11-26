import { BrowserWindow, ipcMain, powerMonitor, WebContentsView } from "electron";
import { store } from "../store";
import { hashMasterPassword, validateNewPassword } from "../masterPassword";
import { checkPassword, credential } from "./passwordCheck";
import {
  INITIAL_LOCK_STATE,
  isEffectivelyLocked,
  LockEvent,
  LockState,
  msUntilLock,
  reduceLock,
  sanitizeLockDelayMinutes,
} from "../lockPolicy";
import type {
  RemoteLockInfo,
  SecurityResult,
  SecurityState,
  SecurityUpdate,
} from "../shared/types";
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
  // Called whenever the workspace goes behind the lock screen or comes out
  // (either lock, see isEffectivelyLocked) so the main process can hide the
  // service views behind it.
  onLockedChanged(locked: boolean): void;
}

let deps: SecurityIpcDeps | null = null;
let lockState: LockState = INITIAL_LOCK_STATE;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
// The second lock: the account is active on another computer (cloud sync,
// ipc/cloud.ts). Not tied to security controls or the master password, and
// unlock-app never clears it; only this computer taking the session back, or
// signing out, does.
let remoteLock: RemoteLockInfo | null = null;

function effectiveLocked(): boolean {
  return isEffectivelyLocked(lockState.locked, remoteLock !== null);
}

function lockOptions() {
  return {
    // A toggle switched on but never given a password can't lock anything.
    enabled: store.get("securityControlsEnabled") === true && credential() !== null,
    delayMinutes: sanitizeLockDelayMinutes(store.get("lockDelayMinutes")),
    autoLock: store.get("autoLockDisabled") !== true,
  };
}

function securityState(): SecurityState {
  return {
    enabled: store.get("securityControlsEnabled") === true,
    hasPassword: credential() !== null,
    lockDelayMinutes: sanitizeLockDelayMinutes(store.get("lockDelayMinutes")),
    autoLockDisabled: store.get("autoLockDisabled") === true,
    locked: effectiveLocked(),
    remoteLock,
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
  const wasLocked = effectiveLocked();
  lockState = next;

  clearTimer();
  const remaining = msUntilLock(lockState, Date.now(), lockOptions());
  if (remaining !== null) {
    lockTimer = setTimeout(() => handleLockEvent("elapsed"), remaining);
  }

  notifyIfChanged(wasLocked);
  broadcast();
}

function notifyIfChanged(wasLocked: boolean) {
  const locked = effectiveLocked();
  if (locked !== wasLocked) deps?.onLockedChanged(locked);
}

/**
 * Sets or clears the remote lock (the account is in use on another computer).
 * Works whether or not security controls are on.
 */
export function setRemoteLock(info: RemoteLockInfo | null): void {
  const wasLocked = effectiveLocked();
  remoteLock = info;
  notifyIfChanged(wasLocked);
  broadcast();
}

/**
 * Re-reads the lock delay and "Don't lock automatically" after something other
 * than these handlers changed them (cloud sync), re-arming or dropping a
 * pending countdown.
 */
export function refreshLockOptions(): void {
  const options = lockOptions();
  // Same as set-lock-delay and set-auto-lock-disabled: a new delay re-arms the
  // countdown, and switching auto-lock off drops it.
  setLockState(options.autoLock ? lockState : reduceLock(lockState, "back", Date.now(), options));
}

export function isRemoteLocked(): boolean {
  return remoteLock !== null;
}

function handleLockEvent(event: LockEvent) {
  setLockState(reduceLock(lockState, event, Date.now(), lockOptions()));
}

/** Whether the workspace is behind the lock screen right now, for either lock. */
export function isWorkspaceLocked(): boolean {
  return effectiveLocked();
}

// Called from window/create.ts once the window exists. Hiding to the tray is the same
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
    const wasLocked = effectiveLocked();
    lockState = { armedAt: null, locked: true };
    notifyIfChanged(wasLocked);
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
      if (effectiveLocked()) return refuse("Unlock the workspace first.");
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
    if (!isFromApp(event) || effectiveLocked()) return securityState();
    store.set("lockDelayMinutes", sanitizeLockDelayMinutes(minutes));
    // Re-arms the pending countdown against the new delay.
    setLockState(lockState);
    return securityState();
  });

  ipcMain.handle("set-auto-lock-disabled", (event, disabled: unknown): SecurityState => {
    if (!isFromApp(event) || effectiveLocked() || typeof disabled !== "boolean") {
      return securityState();
    }
    store.set("autoLockDisabled", disabled);
    // Drops a pending countdown, or lets the next minimize arm one again.
    setLockState(reduceLock(lockState, "back", Date.now(), lockOptions()));
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
      if (effectiveLocked()) return { ok: false, error: "Unlock the workspace first." };
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

  // The sidebar's lock button. Does nothing unless the lock is on and has a
  // password (reduceLock checks), since there'd be no way back in.
  ipcMain.handle("lock-now", (event): SecurityState => {
    if (isFromApp(event)) handleLockEvent("manual");
    return securityState();
  });

  // Clears the password lock only. While the account is in use on another
  // computer the remote lock screen is shown instead and stays up.
  ipcMain.handle("unlock-app", async (event, password: unknown): Promise<SecurityResult> => {
    if (!isFromApp(event)) return { ok: false, error: "Not allowed." };
    if (remoteLock) return { ok: false, error: "Largs Hub is in use on another computer." };
    if (!lockState.locked) return { ok: true };
    const checked = await checkPassword(password, "Wrong password.");
    if (!checked.ok) return checked;
    setLockState({ armedAt: null, locked: false });
    return { ok: true };
  });
}
