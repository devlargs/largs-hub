import type { AutomationPlatform } from "../shared/automationPlatform";
import { buildTypeAndSendScript } from "./scripts";
import { buildWhatsappTypeAndSendScript } from "./whatsappScripts";

// The "type and send" page script for each platform. Pure, so it's tested
// alongside the scripts themselves.
const SEND_SCRIPT_BUILDERS: Record<AutomationPlatform, (message: string) => string> = {
  messenger: buildTypeAndSendScript,
  whatsapp: buildWhatsappTypeAndSendScript,
};

export function buildSendScript(platform: AutomationPlatform, message: string): string {
  return SEND_SCRIPT_BUILDERS[platform](message);
}
