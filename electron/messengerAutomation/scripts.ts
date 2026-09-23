// Page scripts injected into the Messenger view at fire time. Pure strings and
// builders with no Electron imports, so they can be snapshot-tested
// (test/messengerAutomationScripts.test.ts). Messenger ships no stable hooks,
// so these key on role attributes and aria-labels and may need updating if
// their UI changes.

// The message is embedded via JSON.stringify, so quotes/newlines/emoji in the
// text can't break out of the string literal.
export function buildTypeAndSendScript(message: string): string {
  return `
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let input = null;
      for (let i = 0; i < 20 && !input; i++) {
        input = document.querySelector('div[contenteditable="true"]');
        if (!input) await wait(100);
      }
      if (!input) return "no-input";
      input.focus();
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, ${JSON.stringify(message)});
      for (let i = 0; i < 20; i++) {
        const btn = document.querySelector('div[aria-label="Press enter to send"]');
        if (btn) { btn.click(); return "sent"; }
        await wait(100);
      }
      return "no-send-button";
    })()
  `;
}

export const CLICK_CALL_SCRIPT = `
  (() => {
    const btn = document.querySelector('div[aria-label="Start a voice call"]');
    if (btn) { btn.click(); return "clicked"; }
    return "no-call-button";
  })()
`;

// Reads the NoticeSignals (notice.ts) out of the open conversation.
export const NOTICE_SCRIPT = `
  (() => {
    // Rows the call cycle itself produces — ignore them, they aren't a reply.
    const CALL_ROW = /\\b(call|calling|called|ringing|missed|unanswered)\\b/i;
    const rows = [];
    for (const row of document.querySelectorAll('div[role="row"]')) {
      const text = (row.innerText || "").trim();
      if (!text || CALL_ROW.test(text)) continue;
      rows.push(text);
    }
    let seen = false;
    let typing = false;
    for (const el of document.querySelectorAll('[aria-label]')) {
      const label = el.getAttribute('aria-label') || '';
      if (!seen && /\\bseen\\b/i.test(label)) seen = true;
      if (!typing && /is typing|typing\\u2026|typing\\.\\.\\./i.test(label)) typing = true;
      if (seen && typing) break;
    }
    return { count: rows.length, last: rows[rows.length - 1] || "", seen, typing };
  })()
`;
