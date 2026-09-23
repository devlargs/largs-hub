import { store } from "../store";
import { hasActiveDownload } from "../downloads";
import { hasAutomationForService } from "../messengerAutomation";
import { shouldHibernate } from "../hibernationPolicy";
import { resetDecreaseDebounce } from "../notificationCounts";
import { partitionFor, serviceLastActive, serviceViews, viewState } from "./state";
import { destroyServiceView } from "./visibility";

// Periodic teardown of idle service views (hibernationPolicy.ts decides which).

const HIBERNATION_SWEEP_MS = 60_000;
let hibernationSweepTimer: ReturnType<typeof setInterval> | null = null;

// Tear down an idle service view to reclaim its renderer process. The service
// stays enabled and in the store; only the live view goes. Notification counts
// are kept so the sidebar badge survives until the view is reopened.
function hibernateServiceView(serviceId: string) {
  if (!serviceViews.has(serviceId)) return;
  destroyServiceView(serviceId);
  resetDecreaseDebounce(serviceId);
}

// Periodically hibernate views that have been inactive past the user's chosen
// threshold. The active view is always exempt.
function sweepHibernation() {
  const minutes = store.get("hibernateInactiveMinutes");
  if (!minutes || minutes <= 0) return;
  const cutoff = Date.now() - minutes * 60_000;
  for (const serviceId of [...serviceViews.keys()]) {
    const view = serviceViews.get(serviceId);
    if (!view || view.webContents.isDestroyed()) continue;

    const decision = shouldHibernate(
      {
        serviceId,
        lastActiveAt: serviceLastActive.get(serviceId),
        // Work the user started and expects to keep running in the background,
        // which is exactly when the idle timer fires (issue #76).
        audible: view.webContents.isCurrentlyAudible(),
        hasAutomation: hasAutomationForService(serviceId),
        hasDownload: hasActiveDownload(partitionFor(serviceId)),
      },
      viewState.activeServiceId,
      cutoff,
    );

    if (decision.hibernate) {
      hibernateServiceView(serviceId);
      continue;
    }
    // A brand new view has no timestamp yet — start its clock now so it gets a
    // full interval rather than being measured from time it didn't exist.
    if (decision.reason === "no-timestamp") serviceLastActive.set(serviceId, Date.now());
    // "busy" deliberately doesn't reset the clock: the moment the work finishes
    // the view is eligible again, instead of earning another full interval.
  }
}

export function startHibernationSweep() {
  if (!hibernationSweepTimer) {
    hibernationSweepTimer = setInterval(sweepHibernation, HIBERNATION_SWEEP_MS);
  }
}

export function stopHibernationSweep() {
  if (hibernationSweepTimer) {
    clearInterval(hibernationSweepTimer);
    hibernationSweepTimer = null;
  }
}
