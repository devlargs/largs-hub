import { createAutomationGate } from "./automationGate";
import { restoreAutomationState, suspendAutomation } from "./messengerAutomation";

// The one automation gate (automationGate.ts), wired to the scheduler. The
// window's first load, cloud sync and the remote lock drive it.
export const automationGate = createAutomationGate({
  restore: restoreAutomationState,
  suspend: suspendAutomation,
});
