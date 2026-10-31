// --- In-page call answer detection (WhatsApp call cycle) ---------------------
// Pure decision logic for inPageCall.ts, unit-testable without Electron. Each
// poll reads an InPageCallState out of the page (WHATSAPP_CALL_STATE_SCRIPT);
// stepCall folds it into what's been seen so far and says whether the call
// was answered, went unanswered, or should keep ringing.

export interface InPageCallState {
  // An end-call control is showing: a call is ringing or connected.
  active: boolean;
  // The call's duration timer ("0:07"), only shown once it connected.
  timer: string | null;
}

export interface CallWatch {
  // The call UI showed up at least once since the click.
  sawCall: boolean;
  lastTimer: string | null;
}

export type CallOutcome = "answered" | "unanswered" | "ringing";

// How long the call UI may take to appear after the click before the attempt
// counts as unanswered.
export const CALL_APPEAR_GRACE_MS = 8_000;

export const INITIAL_CALL_WATCH: CallWatch = { sawCall: false, lastTimer: null };

export function isInPageCallState(value: unknown): value is InPageCallState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<InPageCallState>;
  return typeof v.active === "boolean" && (v.timer === null || typeof v.timer === "string");
}

// `state` is null when the page couldn't be read this tick.
export function stepCall(
  watch: CallWatch,
  state: InPageCallState | null,
  elapsedMs: number,
  timeoutMs: number,
): { outcome: CallOutcome; watch: CallWatch } {
  if (elapsedMs >= timeoutMs) return { outcome: "unanswered", watch };
  if (state?.active) {
    // Two different timer reads = a timer that's counting = connected.
    if (state.timer && watch.lastTimer && state.timer !== watch.lastTimer) {
      return { outcome: "answered", watch };
    }
    return { outcome: "ringing", watch: { sawCall: true, lastTimer: state.timer } };
  }
  // The call UI went away after showing: declined, or it timed out on their end.
  if (state && watch.sawCall) return { outcome: "unanswered", watch };
  if (!watch.sawCall && elapsedMs > CALL_APPEAR_GRACE_MS) return { outcome: "unanswered", watch };
  return { outcome: "ringing", watch };
}
