import { randomUUID } from "crypto";
import { Menu, type WebContentsView } from "electron";
import { passcodeVault, typeInto } from "../passcodes";
import { getDeps, viewState } from "./state";
import {
  PASSCODE_OFFER_WORLD_ID,
  buildPasscodeOfferScript,
  offerMenuPosition,
  parseLoginFieldFocus,
  passcodesToOffer,
} from "./passcodeOfferScript";

// Offers a saved passcode as soon as you click into a login field, without a
// right-click: a native menu opens under the field (HTML can't draw above the
// view) listing the passcodes saved for this service. The page script and the
// rules live in passcodeOfferScript.ts. Nothing is decrypted until an item is
// clicked, and nothing is offered while the workspace is locked, the window is
// in the background or this service isn't the one on screen.
export function attachPasscodeOffer(view: WebContentsView, serviceId: string) {
  const contents = view.webContents;
  // A fresh token per page load, so a page can't reuse one it once saw
  let token = "";

  contents.on("dom-ready", () => {
    if (contents.isDestroyed()) return;
    // Injected even with nothing saved yet, so a passcode saved while the page
    // is open is offered without a reload. It only listens for focus.
    token = `__largs_passcode_${randomUUID()}__`;
    contents
      .executeJavaScriptInIsolatedWorld(PASSCODE_OFFER_WORLD_ID, [
        { code: buildPasscodeOfferScript(token) },
      ])
      .catch(() => {});
  });

  contents.on("console-message", (details) => {
    const focus = parseLoginFieldFocus(details.message, token);
    if (!focus || !canOffer(view, serviceId)) return;

    const passcodes = passcodesToOffer(passcodeVault.list(), serviceId, focus.kind);
    const mainWindow = getDeps()?.getMainWindow();
    if (passcodes.length === 0 || !mainWindow) return;

    const fill = (text: string | null) => {
      if (text && !contents.isDestroyed()) void typeInto(contents, text);
    };
    const template: Electron.MenuItemConstructorOptions[] = passcodes.map((p) => {
      const name = p.username ? `${p.label} (${p.username})` : p.label;
      return focus.kind === "password"
        ? { label: `Fill passcode: ${name}`, click: () => fill(passcodeVault.reveal(p.id)) }
        : { label: `Fill username: ${name}`, click: () => fill(p.username) };
    });

    const { x, y } = offerMenuPosition(focus, view.getBounds(), contents.getZoomFactor());
    Menu.buildFromTemplate(template).popup({ window: mainWindow, x, y });
  });
}

function canOffer(view: WebContentsView, serviceId: string): boolean {
  return (
    !view.webContents.isDestroyed() &&
    !viewState.viewsSuppressed &&
    viewState.windowFocused &&
    viewState.activeServiceId === serviceId &&
    view.getVisible()
  );
}
