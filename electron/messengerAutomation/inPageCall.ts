import { deps, inject } from "./runtime";
import { INITIAL_CALL_WATCH, isInPageCallState, stepCall } from "./callState";
import { WHATSAPP_CALL_STATE_SCRIPT, WHATSAPP_HANGUP_SCRIPT } from "./whatsappScripts";

// The call cycle's hooks for a call that rings inside the service view itself
// (WhatsApp), rather than in a popup window like Messenger's (callWindow.ts).
// The view is muted while a cycle call rings, the counterpart of the muted,
// minimized Messenger popup, and its usual sound comes back once the call is
// answered or hung up.

const POLL_MS = 1000;

// Resolves true once the call connects, or false when it goes unanswered
// within timeoutMs, in which case it has already been hung up.
export function monitorInPageCall(serviceId: string, timeoutMs: number): Promise<boolean> {
  deps().setCallAudioMuted(serviceId, true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let watch = INITIAL_CALL_WATCH;
    const tick = async () => {
      const read = await inject<unknown>(serviceId, WHATSAPP_CALL_STATE_SCRIPT);
      const step = stepCall(
        watch,
        isInPageCallState(read) ? read : null,
        Date.now() - startedAt,
        timeoutMs,
      );
      watch = step.watch;
      if (step.outcome === "answered") {
        deps().setCallAudioMuted(serviceId, false);
        resolve(true);
        return;
      }
      if (step.outcome === "unanswered") {
        await hangUpInPageCall(serviceId);
        resolve(false);
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    void tick();
  });
}

// End a ringing cycle call. A no-op in the page when no call is up, so it's
// safe on every stop.
export async function hangUpInPageCall(serviceId: string): Promise<void> {
  await inject(serviceId, WHATSAPP_HANGUP_SCRIPT);
  deps().setCallAudioMuted(serviceId, false);
}
