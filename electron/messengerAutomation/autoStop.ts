import type { AutoStopState } from "../shared/types";
import { isAutoStopStillArmed } from "../automationRestore";
import { deps, sendToUi } from "./runtime";

// Auto-stop: an armed countdown that clears every task for a service when it
// expires. At most one per service. What "clear every task" means is passed in
// as `onExpire` by the scheduler, so this module doesn't import it back.

type OnExpire = (serviceId: string) => void;

// serviceId -> armed auto-stop (state + its timer).
const autoStops = new Map<string, AutoStopState & { timer: NodeJS.Timeout }>();

function persistAutoStops() {
  deps().savePersistedAutoStops(
    [...autoStops.values()].map(({ timer: _timer, ...state }) => state),
  );
}

export function publicAutoStop(serviceId: string): AutoStopState | null {
  const armed = autoStops.get(serviceId);
  if (!armed) return null;
  const { timer: _timer, ...state } = armed;
  return state;
}

// `fired` marks the push that follows an expired auto-stop, so the panel can
// say why the task list emptied instead of silently clearing it.
function pushAutoStop(serviceId: string, fired = false) {
  persistAutoStops();
  sendToUi("messenger-automation-auto-stop-updated", {
    serviceId,
    autoStop: publicAutoStop(serviceId),
    fired,
  });
}

// Cancel an armed auto-stop without touching the running tasks. Silent by
// default so callers can decide whether the UI needs a push.
export function clearAutoStop(serviceId: string, notify = true) {
  const armed = autoStops.get(serviceId);
  if (!armed) return false;
  clearTimeout(armed.timer);
  autoStops.delete(serviceId);
  if (notify) pushAutoStop(serviceId);
  else persistAutoStops();
  return true;
}

// Arm (or re-arm) a service's auto-stop. `expiresAt` is only supplied by the
// launch-time restore, which is picking up an arm that's already counting.
export function armAutoStop(
  serviceId: string,
  minutes: number,
  onExpire: OnExpire,
  expiresAt?: number,
) {
  clearAutoStop(serviceId, false);
  const target = expiresAt ?? Date.now() + minutes * 60_000;
  const timer = setTimeout(
    () => {
      // Drop the arm first so onExpire's own cleanup is a no-op and the UI
      // gets one push per side (tasks, then arm).
      autoStops.delete(serviceId);
      onExpire(serviceId);
      pushAutoStop(serviceId, true);
    },
    Math.max(0, target - Date.now()),
  );
  autoStops.set(serviceId, { serviceId, minutes, expiresAt: target, timer });
  persistAutoStops();
}

export function restorePersistedAutoStops(onExpire: OnExpire) {
  const stored = deps().loadPersistedAutoStops();
  if (!Array.isArray(stored)) return;
  const now = Date.now();
  for (const entry of stored) {
    if (typeof entry?.serviceId !== "string") continue;
    // An arm that ran out while the app was closed must not clear a fresh
    // batch of tasks the moment the app opens.
    if (!isAutoStopStillArmed(entry.expiresAt, now)) continue;
    armAutoStop(entry.serviceId, entry.minutes, onExpire, entry.expiresAt);
  }
  persistAutoStops();
}
