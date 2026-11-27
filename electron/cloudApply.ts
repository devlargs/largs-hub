import fs from "fs";
import os from "os";
import { store, type Service, type StoreSchema } from "./store";
import type { CloudWorkspace } from "./shared/types";
import { SYNCED_KEYS } from "./cloudWorkspace";
import {
  applyServiceSound,
  destroyServiceView,
  getServiceView,
  getServiceZoom,
  refreshPrivacyOverlays,
  wakeServiceView,
} from "./serviceViews";
import { syncTray } from "./tray";
import { forgetRemovedService } from "./ipc/services";
import { refreshLockOptions } from "./ipc/security";
import { customIconsDir, resolveCustomIconPath } from "./customIcons";
import { fromHomeRelative } from "./cloudDeviceSettings";
import { applyLoginItem } from "./ipc/loginItem";
import { refreshDevTools } from "./devTools";
import { automationGate } from "./automationRunner";

// Writing a workspace from the cloud into the store, and doing what the normal
// setters would have done afterwards: views for added and removed services,
// the tray, privacy covers, zoom, the lock countdown. The checks happen before
// this, in cloudWorkspace.ts; ipc/cloud.ts calls it.

/** Whether an uploaded icon file is on this computer. */
export function customIconExists(fileName: string): boolean {
  const filePath = resolveCustomIconPath(fileName, customIconsDir());
  return filePath !== null && fs.existsSync(filePath);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function applyCloudWorkspace(workspace: CloudWorkspace): Promise<void> {
  const before = Object.fromEntries(SYNCED_KEYS.map((key) => [key, store.get(key)])) as Pick<
    StoreSchema,
    (typeof SYNCED_KEYS)[number]
  >;

  for (const key of SYNCED_KEYS) {
    if (!sameJson(before[key], workspace[key])) {
      // Each value already has its store key's type (cloudWorkspace.ts checks)
      store.set(key, workspace[key] as never);
    }
  }

  applyWindowSize(workspace);
  applyDownloadFolder(workspace);
  await reconcileServiceViews(before.services, workspace.services);

  if (
    before.closeToTray !== workspace.closeToTray ||
    before.minimizeToTray !== workspace.minimizeToTray
  ) {
    syncTray();
  }
  refreshPrivacyOverlays();
  if (
    before.lockDelayMinutes !== workspace.lockDelayMinutes ||
    before.autoLockDisabled !== workspace.autoLockDisabled ||
    before.securityControlsEnabled !== workspace.securityControlsEnabled ||
    !sameJson(before.masterPasswordCredential, workspace.masterPasswordCredential)
  ) {
    refreshLockOptions();
  }
  if (before.launchAtStartup !== workspace.launchAtStartup) {
    applyLoginItem(workspace.launchAtStartup);
  }
  if (before.debugMode !== workspace.debugMode) refreshDevTools();
  if (
    !sameJson(before.automationTasks, workspace.automationTasks) ||
    !sameJson(before.automationAutoStops, workspace.automationAutoStops)
  ) {
    automationGate.replaced();
  }
}

// The size is used the next time the window opens; its position stays this
// computer's own, and a window open now isn't resized under the person.
function applyWindowSize(workspace: CloudWorkspace) {
  const bounds = store.get("windowBounds");
  const { width, height } = workspace.windowSize;
  if (bounds.width !== width || bounds.height !== height) {
    store.set("windowBounds", { ...bounds, width, height });
  }
}

// null: the other computer's folder is outside its home folder, so this one
// keeps its own. A folder that doesn't exist here yet is created, the way a
// browser creates its download folder; if that fails, this computer's stays.
function applyDownloadFolder(workspace: CloudWorkspace) {
  const relative = workspace.downloadFolderInHome;
  if (relative === null) return;
  const folder = relative === "" ? "" : fromHomeRelative(relative, os.homedir());
  if (folder === store.get("downloadFolder")) return;
  if (folder) {
    try {
      fs.mkdirSync(folder, { recursive: true });
      if (!fs.statSync(folder).isDirectory()) return;
    } catch (error) {
      console.warn("[cloud] Couldn't use the synced download folder here:", error);
      return;
    }
  }
  store.set("downloadFolder", folder);
}

// Same as add-, update- and remove-service would have done, service by service.
async function reconcileServiceViews(previous: Service[], next: Service[]): Promise<void> {
  const nextById = new Map(next.map((s) => [s.id, s]));
  for (const old of previous) {
    const updated = nextById.get(old.id);
    if (!updated) {
      await forgetRemovedService(old.id, old, next);
      continue;
    }
    // A new URL, or switched off: the view has to be rebuilt (or stay gone)
    if (old.url !== updated.url || updated.enabled === false) destroyServiceView(old.id);
  }

  const previousIds = new Set(previous.map((s) => s.id));
  for (const service of next) {
    const view = getServiceView(service.id);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.setZoomFactor(getServiceZoom(service.id));
      applyServiceSound(view, service.id);
    } else if (!previousIds.has(service.id) && store.get("wakeServicesAutomatically")) {
      // A service added on another computer warms up like one added here at launch
      wakeServiceView(service.id);
    }
  }
}
