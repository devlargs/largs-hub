import { ipcMain } from "electron";
import { store } from "../store";
import { isFromApp } from "../appOrigin";
import type { AutomationPrefs } from "../shared/types";
import { sanitizeAutomationPrefs, sanitizeStoredPrefs } from "../automationPrefs";

// IPC: the Messenger automation panel's last-used settings, per service, so
// the panel opens where it was left instead of on its defaults.

function readPrefs(): Record<string, AutomationPrefs> {
  return sanitizeStoredPrefs(
    store.get("automationPrefs"),
    store.get("services").map((s) => s.id),
  );
}

// Forget a service's saved settings (it was removed).
export function clearAutomationPrefs(serviceId: string): void {
  const prefs = readPrefs();
  if (!(serviceId in prefs)) return;
  delete prefs[serviceId];
  store.set("automationPrefs", prefs);
}

export function registerAutomationPrefsIpc() {
  ipcMain.handle("messenger-automation-get-prefs", (_event, serviceId: unknown): AutomationPrefs =>
    typeof serviceId === "string" ? (readPrefs()[serviceId] ?? {}) : {},
  );

  // Writes stored state, so only the app's own page may call it (issue #112).
  ipcMain.handle("messenger-automation-save-prefs", (event, serviceId: unknown, raw: unknown) => {
    if (!isFromApp(event) || typeof serviceId !== "string") return;
    if (!store.get("services").some((s) => s.id === serviceId)) return;
    store.set("automationPrefs", { ...readPrefs(), [serviceId]: sanitizeAutomationPrefs(raw) });
  });
}
