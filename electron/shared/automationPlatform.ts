import type { TaskSpec } from "./types";

// Which services get the automation panel, and which tasks each one offers.
// Shared by main (the start handler refuses anything else) and the renderer
// (the panel only shows these tabs), so the two can't drift apart.

export type AutomationPlatform = "messenger" | "whatsapp";

export const PLATFORM_NAMES: Record<AutomationPlatform, string> = {
  messenger: "Messenger",
  whatsapp: "WhatsApp",
};

// WhatsApp only has the call cycle: its in-page call is driven by
// messengerAutomation/inPageCall.ts, and the message tasks are Messenger's.
export const PLATFORM_TASK_TYPES: Record<AutomationPlatform, readonly TaskSpec["type"][]> = {
  messenger: [
    "sendChatMessage",
    "sendChat",
    "sendChatInterval",
    "sendEmoji",
    "startCallCycle",
    "sendRandomFromList",
  ],
  whatsapp: ["startCallCycle"],
};

export function automationPlatformFor(url: string): AutomationPlatform | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("messenger")) return "messenger";
  if (host === "whatsapp.com" || host.endsWith(".whatsapp.com")) return "whatsapp";
  return null;
}

export function platformSupports(platform: AutomationPlatform, type: TaskSpec["type"]): boolean {
  return PLATFORM_TASK_TYPES[platform].includes(type);
}
