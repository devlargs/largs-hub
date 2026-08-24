import { BrowserWindow, WebContentsView, nativeImage } from "electron";
import { badgeLabel, renderBadgePng } from "./badgeImage";
import { PendingDecrease, shouldAcceptCount } from "./badgeDebounce";

// Notification-count state and badge rendering, separated from count
// *extraction* (issue #46). Extraction sources — title parsing, DOM poll
// scripts, and main-process fetchers in electron/badge-adapters/ — only ever
// call reportNotificationCount(); everything downstream (decrease debounce,
// sidebar IPC, taskbar overlay, frame flash) lives here so rendering issues
// like #28 can be fixed without touching any scraper.

interface NotificationCountDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
  /** Whether badges are enabled for this service (Settings / context menu). */
  isServiceNotificationsEnabled(serviceId: string): boolean;
}

const counts = new Map<string, number>();
// Debounce state for decreases (badgeDebounce.ts): several consecutive lower
// readings are needed before a badge drops, so it doesn't blink to 0 during
// page transitions mid-poll.
const pendingDecrease = new Map<string, PendingDecrease>();

let deps: NotificationCountDeps | null = null;

export function initNotificationCounts(d: NotificationCountDeps) {
  deps = d;
}

// Single entry point for every extraction source. Applies the per-service
// notifications toggle and the decrease debounce, then propagates the change
// to the sidebar (IPC) and the Windows taskbar overlay.
export function reportNotificationCount(serviceId: string, count: number) {
  if (!deps) return;
  if (!deps.isServiceNotificationsEnabled(serviceId)) {
    count = 0;
  }

  const prev = counts.get(serviceId) || 0;
  if (!shouldAcceptCount(pendingDecrease, serviceId, prev, count).accept) return;

  const wasIncrease = count > prev;
  counts.set(serviceId, count);
  updateTaskbarBadge();

  const mainWindow = deps.getMainWindow();
  if (mainWindow) {
    deps.getUiView()?.webContents.send("notification-update", { serviceId, count });
    // Flash taskbar when new notifications arrive and window isn't focused
    if (wasIncrease && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
    }
  }
}

// Forget a service entirely (removed or disabled) and re-render the badge.
export function clearNotificationCount(serviceId: string) {
  counts.delete(serviceId);
  pendingDecrease.delete(serviceId);
  updateTaskbarBadge();
}

// Drop only the in-flight debounce state. Used on hibernation, where the last
// known count is kept so the sidebar badge survives until the view reopens.
export function resetDecreaseDebounce(serviceId: string) {
  pendingDecrease.delete(serviceId);
}

// --- Taskbar badge rendering (issues #28, #58) -----------------------------

// Windows drops an overlay icon set before the window has been shown, so the
// last rendered total is kept and re-applied from refreshTaskbarBadge() once
// the window is up (see main.ts).
let lastTotal = 0;

function totalCount(): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}

// Set by main so a count change also re-renders the tray badge (issue #90).
let onTotalChanged: (() => void) | null = null;

export function setBadgeChangeListener(listener: () => void) {
  onTotalChanged = listener;
}

function updateTaskbarBadge() {
  lastTotal = totalCount();
  applyTaskbarBadge();
  onTotalChanged?.();
}

/**
 * Every service's current count. The renderer's store starts empty on any UI
 * reload while main keeps running, and reportNotificationCount returns early
 * when a reading is unchanged — so without this the sidebar badges stayed
 * blank until a count actually moved (issue #79). The renderer-side
 * counterpart of refreshTaskbarBadge.
 */
export function getNotificationCounts(): Record<string, number> {
  return Object.fromEntries(counts);
}

/** Re-apply the current badge — call after the window is shown or reloaded. */
export function refreshTaskbarBadge() {
  applyTaskbarBadge();
}

function applyTaskbarBadge() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (lastTotal <= 0) {
    mainWindow.setOverlayIcon(null, "");
    return;
  }

  const icon = createBadgeIcon(lastTotal);
  if (icon.isEmpty()) {
    // The old SVG path failed exactly here, silently (issue #58)
    console.warn("[badge] rendered overlay icon was empty; skipping");
    return;
  }
  const label = lastTotal === 1 ? "1 notification" : `${lastTotal} notifications`;
  mainWindow.setOverlayIcon(icon, label);
}

// setOverlayIcon composites at 16x16; the 2x representation keeps the digits
// legible on HiDPI displays, where Windows asks for 20-32px.
function createBadgeIcon(count: number): Electron.NativeImage {
  const icon = nativeImage.createFromBuffer(renderBadgePng(count, 16), {
    width: 16,
    height: 16,
    scaleFactor: 1,
  });
  icon.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: renderBadgePng(count, 32),
  });
  return icon;
}

// Exported for tests / diagnostics: what the badge would read.
export { badgeLabel };
