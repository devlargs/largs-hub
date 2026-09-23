// Page scripts injected into service views and call windows with
// executeJavaScript. Pure strings/builders with no Electron imports, so they
// can be snapshot-tested (test/serviceViewScripts.test.ts): a stray edit to an
// id or selector here silently breaks the overlay or call it drives.

// --- Blur when inactive ------------------------------------------------------

export const BLUR_OVERLAY_ID = "__largs_blur_overlay__";

export const APPLY_BLUR_SCRIPT = `
    (function() {
      if (document.getElementById('${BLUR_OVERLAY_ID}')) return;
      const el = document.createElement('div');
      el.id = '${BLUR_OVERLAY_ID}';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:2147483647;pointer-events:none;transition:opacity 0.15s ease;';
      document.documentElement.appendChild(el);
    })()
  `;

export const REMOVE_BLUR_SCRIPT = `
    (function() {
      const el = document.getElementById('${BLUR_OVERLAY_ID}');
      if (el) el.remove();
    })()
  `;

// --- Privacy mode ------------------------------------------------------------

// Two panels injected over the page, so a glance at the screen only reveals the
// uncovered remainder. The vertical cover comes down from the top over a share
// of the page height; the horizontal one comes in from the left over a share of
// the page width. Each has its own size and opacity, and a size of 0 turns that
// cover off.
export const PRIVACY_VERTICAL_ID = "__largs_privacy_overlay__";
export const PRIVACY_HORIZONTAL_ID = "__largs_privacy_overlay_h__";

export interface PrivacySettings {
  verticalPercent: unknown;
  verticalOpacity: unknown;
  horizontalPercent: unknown;
  horizontalOpacity: unknown;
}

export function clampPercent(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Add, resize or remove both privacy panels to match the stored settings. */
export function buildPrivacyScript(settings: PrivacySettings): string {
  const verticalPercent = clampPercent(settings.verticalPercent, 50);
  const verticalOpacity = clampPercent(settings.verticalOpacity, 100) / 100;
  const horizontalPercent = clampPercent(settings.horizontalPercent, 0);
  const horizontalOpacity = clampPercent(settings.horizontalOpacity, 100) / 100;
  const base =
    "position:fixed;top:0;left:0;background:#181825;z-index:2147483647;pointer-events:none;";
  const verticalCss =
    verticalPercent > 0
      ? `${base}width:100vw;height:${verticalPercent}vh;opacity:${verticalOpacity};`
      : "";
  const horizontalCss =
    horizontalPercent > 0
      ? `${base}width:${horizontalPercent}vw;height:100vh;opacity:${horizontalOpacity};`
      : "";
  return `
    (function() {
      const panels = [
        ['${PRIVACY_VERTICAL_ID}', '${verticalCss}'],
        ['${PRIVACY_HORIZONTAL_ID}', '${horizontalCss}'],
      ];
      for (const [id, css] of panels) {
        const existing = document.getElementById(id);
        if (!css) { if (existing) existing.remove(); continue; }
        if (existing) { existing.style.cssText = css; continue; }
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = css;
        document.documentElement.appendChild(el);
      }
    })()
  `;
}

export const REMOVE_PRIVACY_SCRIPT = `
    (function() {
      for (const id of ['${PRIVACY_VERTICAL_ID}', '${PRIVACY_HORIZONTAL_ID}']) {
        const el = document.getElementById(id);
        if (el) el.remove();
      }
    })()
  `;

// --- Messenger call window ---------------------------------------------------

// Meta's /groupcall/ page opens on a "Ready to call?" screen with a "Start
// call" button — the call isn't placed until it's clicked. To make the call
// actually connect automatically (the whole point of the feature), poll for
// that button once the page loads and click it. Resolves true once clicked so
// the caller stops re-injecting; the button is gone once in-call, so a stray
// extra run is a no-op.
export const AUTO_START_CALL_SCRIPT = `
  (() => new Promise((resolve) => {
    const deadline = Date.now() + 15000;
    const scan = () => {
      for (const el of document.querySelectorAll('div[role="button"], button')) {
        const label = (el.getAttribute('aria-label') || '').trim();
        const text = (el.textContent || '').trim();
        if (/^start call$/i.test(label) || /^start call$/i.test(text)) {
          el.click();
          resolve(true);
          return;
        }
      }
      if (Date.now() < deadline) setTimeout(scan, 300);
      else resolve(false);
    };
    scan();
  }))()
`;

// Click Messenger's red end-call button so the call ends cleanly on Messenger's
// side (the callee stops ringing) before we tear the popup down.
export const HANGUP_SCRIPT = `
  (() => {
    const rx = /end call|leave call|hang ?up|end room/i;
    for (const el of document.querySelectorAll('div[role="button"], button, [aria-label]')) {
      const label = (el.getAttribute('aria-label') || '').trim();
      if (label && rx.test(label)) { el.click(); return true; }
    }
    return false;
  })()
`;

const RING_COUNTDOWN_ID = "__largs_ring_countdown__";

// One round-trip into the call popup per poll: (1) draw/update a countdown pill
// showing how many seconds until an unanswered call is hung up and the cycle
// restarts, and (2) return the call-duration timer if the page shows one. A
// connected Messenger call shows a timer counting up; the outgoing "ringing"
// screen doesn't — seeing that timer advance is what tells "answered" from
// "still ringing". (The pill's own text isn't a m:ss timer, so it can't
// false-positive the scan.)
export function buildCallOverlayScript(remainingSec: number): string {
  return `
    (() => {
      let el = document.getElementById('${RING_COUNTDOWN_ID}');
      if (!el) {
        el = document.createElement('div');
        el.id = '${RING_COUNTDOWN_ID}';
        el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(24,24,37,0.92);color:#fff;font:600 13px system-ui,-apple-system,sans-serif;padding:6px 14px;border-radius:999px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.45);';
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = 'Ending call in ${remainingSec}s';
      for (const node of document.querySelectorAll('span, div')) {
        if (node.children.length) continue;
        const t = (node.textContent || '').trim();
        if (/^\\d{1,2}:\\d{2}(:\\d{2})?$/.test(t)) return t;
      }
      return null;
    })()
  `;
}

export const REMOVE_CALL_OVERLAY_SCRIPT = `
  (() => {
    const el = document.getElementById('${RING_COUNTDOWN_ID}');
    if (el) el.remove();
  })()
`;
