// What the tray icon shows and offers.
//
// Closing the window used to quit the app outright, so there was no way to keep
// badges and notifications running with the window out of the way — the choice
// was "window on screen" or "not running at all" (issue #90).
//
// Pure so it can be unit-tested; the Tray itself is built in tray.ts.

export interface TrayServiceEntry {
  id: string;
  name: string;
  unread: number;
  enabled: boolean;
}

/** Services worth listing in the tray menu, in sidebar order. */
export function trayServiceEntries(
  services: Array<{ id: string; name: string; enabled?: boolean }>,
  counts: Record<string, number>,
): TrayServiceEntry[] {
  return services
    .filter((s) => s.enabled !== false)
    .map((s) => ({
      id: s.id,
      name: s.name,
      unread: Math.max(0, counts[s.id] ?? 0),
      enabled: true,
    }));
}

/** "Largs Hub" / "Largs Hub — 3 unread" for the tray tooltip. */
export function trayTooltip(total: number, appName = "Largs Hub"): string {
  if (total <= 0) return appName;
  return `${appName} — ${total} unread`;
}

/** "Gmail" / "Gmail (3)" for a service row in the tray menu. */
export function trayServiceLabel(entry: TrayServiceEntry): string {
  return entry.unread > 0 ? `${entry.name} (${entry.unread})` : entry.name;
}

export type WindowCloseAction = "hide" | "quit";

/**
 * What a window close should do.
 *
 * Both tray behaviours default off, so the app keeps quitting on close exactly
 * as it did before unless the setting is turned on. Hiding to a tray that isn't
 * there would leave the app running with no way to reach it, so the tray has to
 * actually exist.
 */
export function windowCloseAction(closeToTray: boolean, trayAvailable: boolean): WindowCloseAction {
  return closeToTray && trayAvailable ? "hide" : "quit";
}

/** Same reasoning for minimize: only hide when there's a tray to restore from. */
export function windowMinimizeAction(
  minimizeToTray: boolean,
  trayAvailable: boolean,
): WindowCloseAction {
  return minimizeToTray && trayAvailable ? "hide" : "quit";
}
