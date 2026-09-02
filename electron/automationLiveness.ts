// Whether an automation task should keep running when its service view isn't
// there to inject into.
//
// A task used to be discarded the moment `getServiceView` came back empty, on
// the assumption that a missing view meant the service was gone. It doesn't.
// Views are torn down and rebuilt for reasons that have nothing to do with the
// user's automation — hibernation, a URL change, "Clear data", and the whole
// view map being dropped when the window closes — and each of those silently
// took every task for that service with it (issue #97).
//
// The call cycle felt it worst because it is the only spec that injects on a
// two-second poll rather than a long timer, so it was overwhelmingly the most
// likely to be mid-injection during one of those gaps.
//
// The rule is now: only the *service* going away ends a task. A view that is
// merely absent means wait — it comes back the next time the service is opened.
//
// Pure so it can be unit-tested without an Electron runtime.

export const WAITING_FOR_VIEW = "Waiting for the service to load";
export const SERVICE_REMOVED = "Service was removed";
export const SERVICE_DISABLED = "Service was disabled";

export type LivenessAction =
  { action: "run" } | { action: "wait"; reason: string } | { action: "stop"; reason: string };

export interface LivenessInput {
  /** The service as it stands in the store, or undefined if it's been removed. */
  service: { enabled?: boolean } | undefined;
  /** A live, non-destroyed view exists to inject into right now. */
  viewPresent: boolean;
}

export function livenessFor({ service, viewPresent }: LivenessInput): LivenessAction {
  // Gone from the store: nothing will ever come back for this task to run in.
  if (!service) return { action: "stop", reason: SERVICE_REMOVED };
  // Disabling a service frees its view on purpose and is a deliberate "stop
  // doing things with this account", so it ends the task rather than parking it.
  if (service.enabled === false) return { action: "stop", reason: SERVICE_DISABLED };
  if (!viewPresent) return { action: "wait", reason: WAITING_FOR_VIEW };
  return { action: "run" };
}
