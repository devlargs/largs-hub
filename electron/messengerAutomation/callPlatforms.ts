import { AutomationPlatform, automationPlatformFor } from "../shared/automationPlatform";
import { deps } from "./runtime";
import { CLICK_CALL_SCRIPT, NOTICE_SCRIPT } from "./scripts";
import { WHATSAPP_CLICK_CALL_SCRIPT, WHATSAPP_NOTICE_SCRIPT } from "./whatsappScripts";
import { hangUpInPageCall, monitorInPageCall } from "./inPageCall";

// How the call cycle places, watches and ends a call on each platform. The
// loop itself (callCycle.ts) is the same for both.

export interface CallPlatform {
  clickCallScript: string;
  noticeScript: string;
  // Just before the call button is clicked.
  arm: (serviceId: string) => void;
  // Ring for up to timeoutMs: true if answered, false once hung up unanswered.
  monitorForAnswer: (serviceId: string, timeoutMs: number) => Promise<boolean>;
  hangUp: (serviceId: string) => void;
}

const CALL_PLATFORMS: Record<AutomationPlatform, CallPlatform> = {
  // The call opens in an in-app popup window (serviceViews/callWindow.ts).
  messenger: {
    clickCallScript: CLICK_CALL_SCRIPT,
    noticeScript: NOTICE_SCRIPT,
    arm: (serviceId) => deps().armAutomationCall(serviceId),
    monitorForAnswer: (serviceId, timeoutMs) => deps().monitorCallForAnswer(serviceId, timeoutMs),
    hangUp: (serviceId) => deps().closeCallWindow(serviceId),
  },
  // The call rings inside the WhatsApp page (inPageCall.ts).
  whatsapp: {
    clickCallScript: WHATSAPP_CLICK_CALL_SCRIPT,
    noticeScript: WHATSAPP_NOTICE_SCRIPT,
    arm: () => {},
    monitorForAnswer: monitorInPageCall,
    hangUp: (serviceId) => void hangUpInPageCall(serviceId),
  },
};

export function platformForService(serviceId: string): AutomationPlatform | null {
  const service = deps()
    .getServices()
    .find((s) => s.id === serviceId);
  return service ? automationPlatformFor(service.url) : null;
}

// Messenger is the fallback: a removed service's task still gets a hang-up,
// and closing a popup that isn't there is harmless.
export function callPlatformFor(serviceId: string): CallPlatform {
  return CALL_PLATFORMS[platformForService(serviceId) ?? "messenger"];
}
