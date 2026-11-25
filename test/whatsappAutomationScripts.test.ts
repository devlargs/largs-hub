import { describe, expect, it } from "vitest";
import {
  WHATSAPP_CALL_STATE_SCRIPT,
  WHATSAPP_CLICK_CALL_SCRIPT,
  WHATSAPP_HANGUP_SCRIPT,
  WHATSAPP_NOTICE_SCRIPT,
  buildWhatsappTypeAndSendScript,
} from "../electron/messengerAutomation/whatsappScripts";
import { buildSendScript } from "../electron/messengerAutomation/sendScripts";
import { buildTypeAndSendScript } from "../electron/messengerAutomation/scripts";

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

  it("builds a send script that parses and matches its snapshot", () => {
    const code = buildWhatsappTypeAndSendScript("hello");
    expect(() => parses(code)).not.toThrow();
    expect(code).toMatchSnapshot();
  });

  it("embeds any message as a safe string literal", () => {
    const message = `it's "quoted"\nwith a newline, a \\ and \`backticks\` ${"${x}"} 😀`;
    const code = buildWhatsappTypeAndSendScript(message);
    expect(() => parses(code)).not.toThrow();
    expect(code).toContain(
      `document.execCommand("insertText", false, ${JSON.stringify(message)});`,
    );
  });

  it("types into the open chat's compose box, not the chat-list search", () => {
    expect(buildWhatsappTypeAndSendScript("hi")).toContain(
      `#main footer div[contenteditable="true"]`,
    );
  });
});

describe("buildSendScript", () => {
  it("picks each platform's send script", () => {
    expect(buildSendScript("whatsapp", "hi")).toBe(buildWhatsappTypeAndSendScript("hi"));
    expect(buildSendScript("messenger", "hi")).toBe(buildTypeAndSendScript("hi"));
  });
});
