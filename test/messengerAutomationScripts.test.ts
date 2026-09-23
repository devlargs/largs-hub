import { describe, expect, it } from "vitest";
import {
  CLICK_CALL_SCRIPT,
  NOTICE_SCRIPT,
  buildTypeAndSendScript,
} from "../electron/messengerAutomation/scripts";

// Scripts injected into the Messenger view at fire time. A syntax slip there
// only surfaces as a task reporting "error" on every fire, so parse each one
// and pin its text.

const parses = (code: string) => new Function(code);

describe("messenger automation scripts", () => {
  it.each(Object.entries({ CLICK_CALL_SCRIPT, NOTICE_SCRIPT }))(
    "%s parses and matches its snapshot",
    (_name, code) => {
      expect(() => parses(code)).not.toThrow();
      expect(code).toMatchSnapshot();
    },
  );

  it("builds a parseable type-and-send script", () => {
    const code = buildTypeAndSendScript("hello");
    expect(() => parses(code)).not.toThrow();
    expect(code).toMatchSnapshot();
  });

  it("embeds any message as a safe string literal", () => {
    const message = `it's "quoted"\nwith a newline, a \\ and \`backticks\` ${"${x}"} 😀`;
    const code = buildTypeAndSendScript(message);
    expect(() => parses(code)).not.toThrow();
    expect(code).toContain(
      `document.execCommand("insertText", false, ${JSON.stringify(message)});`,
    );
  });

  it("keeps the notice regexes escaped once they're inside the page", () => {
    expect(NOTICE_SCRIPT).toContain("/\\b(call|calling|called|ringing|missed|unanswered)\\b/i");
    expect(NOTICE_SCRIPT).toContain("/\\bseen\\b/i");
  });
});
