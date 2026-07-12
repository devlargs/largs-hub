import { BrowserWindow, WebContentsView, nativeImage } from "electron";

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
// Require several consecutive lower readings before accepting a decrease, so
// badges don't blink to 0 during page transitions mid-poll.
const pendingDecrease = new Map<string, { count: number; streak: number }>();
const DECREASE_THRESHOLD = 2;

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
  if (count === prev) {
    pendingDecrease.delete(serviceId);
    return;
  }

  if (count < prev) {
    const pending = pendingDecrease.get(serviceId);
    if (pending && pending.count === count) {
      pending.streak++;
      if (pending.streak < DECREASE_THRESHOLD) return;
    } else {
      pendingDecrease.set(serviceId, { count, streak: 1 });
      return;
    }
    pendingDecrease.delete(serviceId);
  } else {
    pendingDecrease.delete(serviceId);
  }

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

// --- Taskbar badge rendering (issue #28) -----------------------------------

function updateTaskbarBadge() {
  const mainWindow = deps?.getMainWindow();
  if (!mainWindow) return;
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  if (total > 0) {
    mainWindow.setOverlayIcon(createBadgeIcon(total), `${total} notifications`);
  } else {
    mainWindow.setOverlayIcon(null, "");
  }
}

function createBadgeIcon(count: number): Electron.NativeImage {
  const text = count > 99 ? "99+" : String(count);
  // Rendered as an SVG data URL — small, crisp, and no offscreen window needed
  const size = 16;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ef4444"/>
    <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central"
      font-family="Arial" font-size="${text.length > 2 ? 7 : text.length > 1 ? 8 : 10}" font-weight="bold" fill="white">${text}</text>
  </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return nativeImage.createFromDataURL(dataUrl);
}
