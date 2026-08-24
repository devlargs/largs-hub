// Which service views hibernation is allowed to tear down.
//
// Hibernation is presented as a memory optimisation with no behavioural cost
// ("they reload on next click"), but the only thing it used to skip was the
// active service. A Messenger view running an automation task is a background
// view by definition — you switch away and let it run — so the sweep destroyed
// the view, the destroy hook stopped every task, and the panel just showed an
// empty list with no explanation (issue #76).
//
// Pure so it can be unit-tested without an Electron runtime.

export interface HibernationCandidate {
  serviceId: string;
  /** When this view last stopped being the active one; undefined if brand new. */
  lastActiveAt: number | undefined;
  /** The view is currently playing audio (a call, a video). */
  audible: boolean;
  /** The service has scheduled or running automation tasks. */
  hasAutomation: boolean;
  /** The view has a download in flight. */
  hasDownload: boolean;
}

export type HibernationDecision =
  | { hibernate: true }
  | { hibernate: false; reason: "active" | "not-idle-yet" | "busy" | "no-timestamp" };

/**
 * Whether one view may be hibernated right now.
 *
 * The three "busy" conditions are what makes this more than an idle check: each
 * is work the user set going and expects to keep running while the view sits in
 * the background, which is exactly when the idle timer would fire.
 */
export function shouldHibernate(
  candidate: HibernationCandidate,
  activeServiceId: string | null,
  cutoff: number,
): HibernationDecision {
  if (candidate.serviceId === activeServiceId) return { hibernate: false, reason: "active" };
  // Brand new: give it a full interval rather than counting time it didn't exist.
  if (candidate.lastActiveAt === undefined) return { hibernate: false, reason: "no-timestamp" };
  if (candidate.lastActiveAt > cutoff) return { hibernate: false, reason: "not-idle-yet" };
  if (candidate.audible || candidate.hasAutomation || candidate.hasDownload) {
    return { hibernate: false, reason: "busy" };
  }
  return { hibernate: true };
}
