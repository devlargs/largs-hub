import { app, ipcMain, WebContentsView } from "electron";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { store } from "../store";
import { isFromApp } from "../appOrigin";
import type {
  CloudApplyResult,
  CloudDeviceInfo,
  CloudPasscodeKeyResult,
  CloudWorkspaceExport,
} from "../shared/types";
import { sanitizeRemoteLockInfo } from "../shared/remoteSession";
import {
  pickCloudWorkspace,
  sanitizeCloudWorkspace,
  WATCHED_STORE_KEYS,
  workspaceFingerprint,
} from "../cloudWorkspace";
import { automationGate } from "../automationRunner";
import {
  accountChanged,
  cloudPasscodeKeyring,
  exportCloudPasscodes,
  onCloudPasscodesChanged,
  seedCloudPasscodes,
  setCloudPasscodeKey,
} from "../passcodes";
import { applyCloudWorkspace, customIconExists } from "../cloudApply";
import { isWorkspaceLocked, setRemoteLock } from "./security";
import { LAUNCHED_AT_LOGIN_ARG } from "./loginItem";

// IPC: accounts and cloud sync. Firebase itself runs in the renderer
// (src/lib/cloudSync.ts); main owns the workspace and the lock, so the
// renderer reads and writes the workspace only through these handlers, which
// check everything coming in, and tells main when to lock because the account
// is in use on another computer.
//
// Passwords never come here: signing in is entirely the renderer's.

interface CloudIpcDeps {
  getUiView(): WebContentsView | null;
}

// Local changes settle for this long before the renderer is asked to push.
const CHANGE_DEBOUNCE_MS = 2000;

let deps: CloudIpcDeps | null = null;
let unsubscribers: Array<() => void> = [];
let changeTimer: ReturnType<typeof setTimeout> | null = null;
// Set while a workspace from the cloud is being written, so those writes
// aren't reported back as local changes (the echo loop).
let applyingRemote = false;
// The fingerprint last pushed or applied: a change that lands back on it has
// nothing new to push.
let lastSyncedFingerprint: string | null = null;

function deviceId(): string {
  let id = store.get("cloudDeviceId");
  if (typeof id !== "string" || id.length === 0) {
    id = uuidv4();
    store.set("cloudDeviceId", id);
  }
  return id;
}

// macOS hostnames usually end in ".local", which says nothing to a person.
function deviceName(): string {
  return os.hostname().replace(/\.local$/i, "") || "This computer";
}

// Started by the OS at sign-in. Windows: the login item carries an argument
// (loginItem.ts). macOS: Electron's wasOpenedAtLogin, which macOS 13+ (where
// login items go through SMAppService) may not report, so a launch there can
// read as a normal one; the cost is only that it takes the session back.
function wasLaunchedAtLogin(): boolean {
  if (process.platform === "win32") return process.argv.includes(LAUNCHED_AT_LOGIN_ARG);
  if (process.platform === "darwin") {
    try {
      return app.getLoginItemSettings().wasOpenedAtLogin === true;
    } catch {
      return false;
    }
  }
  return false;
}

function exportWorkspace(): CloudWorkspaceExport {
  const workspace = pickCloudWorkspace(store.store, os.homedir());
  // Passcodes aren't in the store while signed in: they're in memory, sealed
  workspace.passcodeVault = exportCloudPasscodes();
  return { workspace, fingerprint: workspaceFingerprint(workspace) };
}

function clearChangeTimer() {
  if (changeTimer) {
    clearTimeout(changeTimer);
    changeTimer = null;
  }
}

function onSyncedKeyChanged() {
  if (applyingRemote) return;
  clearChangeTimer();
  changeTimer = setTimeout(() => {
    changeTimer = null;
    if (applyingRemote) return;
    const { fingerprint } = exportWorkspace();
    if (fingerprint === lastSyncedFingerprint) return;
    deps?.getUiView()?.webContents.send("cloud-workspace-changed", fingerprint);
  }, CHANGE_DEBOUNCE_MS);
}

function setSyncEnabled(enabled: boolean) {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  clearChangeTimer();
  if (!enabled) return;
  for (const key of WATCHED_STORE_KEYS) {
    unsubscribers.push(store.onDidChange(key, onSyncedKeyChanged));
  }
  // Anything changed before sync was on (passcodes moved into the account
  // during the first sync) goes up now
  onSyncedKeyChanged();
  // Synced with the account, so this computer runs the automation now
  automationGate.synced();
}

// Firebase uids are 28 characters; anything else isn't one
const isUid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function registerCloudIpc(d: CloudIpcDeps) {
  deps = d;
  // A passcode saved, edited or removed is a change to push, like a setting
  onCloudPasscodesChanged(() => {
    if (unsubscribers.length > 0) onSyncedKeyChanged();
  });

  ipcMain.handle("cloud-get-device-info", (): CloudDeviceInfo => ({
    deviceId: deviceId(),
    deviceName: deviceName(),
    platform: process.platform,
    wasLaunchedAtLogin: wasLaunchedAtLogin(),
  }));

  // Read-only, but it's the whole workspace: only for the app's own page.
  ipcMain.handle("cloud-export-workspace", (event): CloudWorkspaceExport | null =>
    isFromApp(event) ? exportWorkspace() : null,
  );

  ipcMain.handle(
    "cloud-apply-workspace",
    async (event, raw: unknown): Promise<CloudApplyResult> => {
      if (!isFromApp(event)) return { ok: false, error: "Not allowed." };
      const workspace = sanitizeCloudWorkspace(raw, {
        iconExists: customIconExists,
        localServices: store.get("services"),
      });
      if (!workspace) return { ok: false, error: "The account's workspace couldn't be read." };

      applyingRemote = true;
      clearChangeTimer();
      try {
        await applyCloudWorkspace(workspace);
        seedCloudPasscodes(workspace.passcodeVault);
      } catch (error) {
        console.error("[cloud] Failed to apply the account's workspace:", error);
        return { ok: false, error: "The account's workspace couldn't be applied." };
      } finally {
        applyingRemote = false;
      }
      // What's in the store now, which can differ from what came in (an icon
      // file that isn't on this computer), so the next real change is compared
      // against this. Passcodes count as the account has them: ones moved in
      // from this computer just now are still to be pushed.
      const { workspace: applied, fingerprint } = exportWorkspace();
      lastSyncedFingerprint = workspaceFingerprint({
        ...applied,
        passcodeVault: workspace.passcodeVault,
      });
      if (fingerprint !== lastSyncedFingerprint) onSyncedKeyChanged();

      const uiView = deps?.getUiView();
      uiView?.webContents.send("services-updated", store.get("services"));
      uiView?.webContents.send("settings-updated");
      return { ok: true, fingerprint };
    },
  );

  ipcMain.handle("cloud-mark-synced", (event, fingerprint: unknown) => {
    if (!isFromApp(event) || typeof fingerprint !== "string") return;
    lastSyncedFingerprint = fingerprint;
  });

  ipcMain.handle("cloud-set-remote-lock", (event, raw: unknown) => {
    if (!isFromApp(event)) return;
    if (raw === null) {
      setRemoteLock(null);
      return;
    }
    const info = sanitizeRemoteLockInfo(raw);
    if (!info) return;
    setRemoteLock(info);
    // Another computer has the session: it runs the automation, not this one
    automationGate.remoteLocked();
  });

  // Who's signed in here (null: nobody, or accounts are off in this build).
  // Remembered for the next launch, which has to know before the renderer is
  // up whether to wait for the account before running automation.
  ipcMain.handle("cloud-set-account", (event, uid: unknown) => {
    if (!isFromApp(event)) return;
    if (uid === null) {
      accountChanged("");
      store.set("cloudAccountUid", "");
      automationGate.signedOut();
    } else if (isUid(uid)) {
      accountChanged(uid);
      store.set("cloudAccountUid", uid);
    }
  });

  // Passcodes in the account (passcodes/index.ts). The renderer never sees
  // them: it only unwraps the key with the account password and hands it over.

  // The account's copy, read before the first sync decides anything, so
  // pushing this computer's workspace can't overwrite passcodes saved elsewhere
  ipcMain.handle("cloud-seed-passcodes", (event, raw: unknown) => {
    if (!isFromApp(event)) return;
    seedCloudPasscodes(raw ?? null);
  });

  ipcMain.handle("cloud-passcode-keyring", (event) =>
    isFromApp(event) ? cloudPasscodeKeyring() : null,
  );

  ipcMain.handle("cloud-set-passcode-key", (event, payload: unknown): CloudPasscodeKeyResult => {
    if (!isFromApp(event)) return { ok: false, error: "Not allowed." };
    if (isWorkspaceLocked()) return { ok: false, error: "Unlock the workspace first." };
    const result = setCloudPasscodeKey(payload);
    if (result.ok) deps?.getUiView()?.webContents.send("passcodes-changed");
    return result;
  });

  ipcMain.handle("cloud-set-sync-enabled", (event, enabled: unknown) => {
    if (!isFromApp(event) || typeof enabled !== "boolean") return;
    setSyncEnabled(enabled);
  });
}
