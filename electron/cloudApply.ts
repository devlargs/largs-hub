import fs from "fs";
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
    before.autoLockDisabled !== workspace.autoLockDisabled
  ) {
    refreshLockOptions();
  }
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
