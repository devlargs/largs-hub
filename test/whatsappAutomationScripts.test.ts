import { describe, expect, it } from "vitest";
import {
  WHATSAPP_CALL_STATE_SCRIPT,
  WHATSAPP_CLICK_CALL_SCRIPT,
  WHATSAPP_HANGUP_SCRIPT,
  WHATSAPP_NOTICE_SCRIPT,
} from "../electron/messengerAutomation/whatsappScripts";

// Scripts the WhatsApp call cycle injects. A syntax slip there only surfaces
// as a task reporting "error" on every fire, so parse each one and pin its text.

const parses = (code: string) => new Function(code);

describe("whatsapp automation scripts", () => {
  it.each(
    Object.entries({
      WHATSAPP_CLICK_CALL_SCRIPT,
      WHATSAPP_NOTICE_SCRIPT,
      WHATSAPP_CALL_STATE_SCRIPT,
      WHATSAPP_HANGUP_SCRIPT,
    }),
  )("%s parses and matches its snapshot", (_name, code) => {
    expect(() => parses(code)).not.toThrow();
    expect(code).toMatchSnapshot();
  });
});
