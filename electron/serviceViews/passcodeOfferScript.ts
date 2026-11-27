import type { Passcode } from "../shared/types";

// The page half of the automatic passcode offer (passcodeOffer.ts): pure, so
// it is unit-tested (test/passcodeOffer.test.ts).
//
// Service views have no preload, so the page can't call main directly. The
// script runs in an isolated world (the page can't see its variables or its
// console) and reports a focused login field with a console.debug line that
// starts with a per-load random token. Main listens for that line. A page that
// forged one could at most pop the menu: it lists names, and a passcode is only
// decrypted and typed when you click an item.

// A world id of our own, clear of Electron's (0 is the page's, 999 is the
// preload's) and of the other scripts in this app, which run in the page's world.
export const PASSCODE_OFFER_WORLD_ID = 1207;

export type LoginFieldKind = "password" | "username";

export interface LoginFieldFocus {
  kind: LoginFieldKind;
  // The field's bottom-left corner, in CSS pixels from the page's top-left
  x: number;
  y: number;
}

/**
 * The isolated-world script. It reports each login field once per page load:
 * a field focused again (after the menu closes, or when the window regains
 * focus) doesn't reopen the menu.
 */
export function buildPasscodeOfferScript(token: string): string {
  return `
(() => {
  if (window.__largsPasscodeOffer) return;
  window.__largsPasscodeOffer = true;
  const TOKEN = ${JSON.stringify(token)};
  const offered = new WeakSet();
  const USERNAME_HINT = /user|email|e-mail|login|phone|mobile|account/i;
  const usable = (el) =>
    el instanceof HTMLInputElement && !el.disabled && !el.readOnly && el.offsetParent !== null;
  const kindOf = (el) => {
    if (!usable(el)) return null;
    const type = (el.type || "text").toLowerCase();
    if (type === "password") return "password";
    if (type !== "text" && type !== "email" && type !== "tel") return null;
    const hints = [el.autocomplete, el.name, el.id, el.getAttribute("aria-label"), el.placeholder]
      .filter(Boolean)
      .join(" ");
    if (!USERNAME_HINT.test(hints)) return null;
    // Only next to a password field: a search box or a chat input never offers
    const scope = el.form || document;
    return scope.querySelector('input[type="password"]') ? "username" : null;
  };
  document.addEventListener(
    "focusin",
    (event) => {
      const el = event.target;
      const kind = kindOf(el);
      if (!kind || offered.has(el)) return;
      offered.add(el);
      const rect = el.getBoundingClientRect();
      console.debug(TOKEN + JSON.stringify({ kind, x: rect.left, y: rect.bottom }));
    },
    true,
  );
})();
`;
}

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 100_000;

/** The field a console line reports, or null when it isn't one of ours. */
export function parseLoginFieldFocus(message: string, token: string): LoginFieldFocus | null {
  if (!token || !message.startsWith(token)) return null;
  let data: unknown;
  try {
    data = JSON.parse(message.slice(token.length));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { kind, x, y } = data as Record<string, unknown>;
  if (kind !== "password" && kind !== "username") return null;
  if (!isCoordinate(x) || !isCoordinate(y)) return null;
  return { kind, x, y };
}

/**
 * Which saved passcodes a focused field offers. Only the ones tied to this
 * service: a passcode saved for every service stays in the right-click menu,
 * so it doesn't pop up on every login page in every service. A username field
 * offers only the entries that have a username.
 */
export function passcodesToOffer<T extends Passcode>(
  passcodes: readonly T[],
  serviceId: string,
  kind: LoginFieldKind,
): T[] {
  return passcodes
    .filter((p) => p.serviceId === serviceId && (kind === "password" || p.username !== ""))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Where the menu opens, in window coordinates: just under the field. */
export function offerMenuPosition(
  focus: LoginFieldFocus,
  viewBounds: { x: number; y: number; width: number; height: number },
  zoomFactor: number,
): { x: number; y: number } {
  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
  return {
    x: Math.round(viewBounds.x + clamp(focus.x * zoom, viewBounds.width)),
    y: Math.round(viewBounds.y + clamp(focus.y * zoom + 2, viewBounds.height)),
  };
}
