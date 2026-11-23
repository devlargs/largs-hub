import type { AutomationPlatform } from "../shared/automationPlatform";
import { buildTypeAndSendScript } from "./scripts";
import { buildWhatsAppSendScript } from "./whatsappScripts";

// The type-and-send page script for a platform. Pure, so the choice is
// unit-tested; tasks.ts resolves the platform from the service at fire time.
// Messenger is the fallback, matching callPlatforms.ts.
export function buildSendScript(platform: AutomationPlatform | null, message: string): string {
  return platform === "whatsapp"
    ? buildWhatsAppSendScript(message)
    : buildTypeAndSendScript(message);
}
