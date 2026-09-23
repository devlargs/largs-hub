import { Menu, WebContentsView } from "electron";
import { DEFAULT_ZOOM } from "../zoom";
import { getDeps } from "./state";
import { getServiceZoom, openFindBarFor, stepServiceZoom } from "./findZoom";

// The native right-click menu for a service view. HTML menus can't render
// above a WebContentsView, so this is built in main (see CLAUDE.md).
export function attachContextMenu(view: WebContentsView, serviceId: string, partition: string) {
  view.webContents.on("context-menu", (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // Spellcheck first: right-clicking a squiggle should open onto the
    // corrections, not scroll past image and link items to reach them.
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuItems.push({
          label: suggestion,
          click: () => view.webContents.replaceMisspelling(suggestion),
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        menuItems.push({ label: "No suggestions", enabled: false });
      }
      menuItems.push(
        {
          label: "Add to dictionary",
          click: () =>
            view.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: "separator" },
      );
    }

    // Cut/Copy/Paste act on the service view explicitly rather than through
    // menu roles, which would target whichever webContents happens to be
    // focused when the popup opens.
    const { editFlags } = params;
    if (params.isEditable) {
      menuItems.push(
        { label: "Cut", enabled: editFlags.canCut, click: () => view.webContents.cut() },
        { label: "Copy", enabled: editFlags.canCopy, click: () => view.webContents.copy() },
        { label: "Paste", enabled: editFlags.canPaste, click: () => view.webContents.paste() },
        {
          label: "Paste as plain text",
          enabled: editFlags.canPaste,
          click: () => view.webContents.pasteAndMatchStyle(),
        },
        { label: "Select all", click: () => view.webContents.selectAll() },
        { type: "separator" },
      );
    } else if (params.selectionText) {
      menuItems.push(
        { label: "Copy", enabled: editFlags.canCopy, click: () => view.webContents.copy() },
        { type: "separator" },
      );
    }

    if (params.mediaType === "image") {
      menuItems.push(
        {
          label: "Copy Image",
          click: () => view.webContents.copyImageAt(params.x, params.y),
        },
        {
          label: "Save Image",
          click: () => view.webContents.downloadURL(params.srcURL),
        },
      );
    }

    if (params.linkURL) {
      if (/^https?:/i.test(params.linkURL)) {
        menuItems.push({
          label: "View Link",
          click: () => getDeps()?.openLinkPreview(params.linkURL, partition),
        });
      }
      menuItems.push({
        label: "Download File",
        click: () => view.webContents.downloadURL(params.linkURL),
      });
    }

    // Page-wide items are always offered, so the menu is never empty and
    // Ctrl+F / zoom stay discoverable without a keyboard shortcut.
    if (menuItems.length > 0 && menuItems[menuItems.length - 1].type !== "separator") {
      menuItems.push({ type: "separator" });
    }
    menuItems.push(
      {
        label: "Find in page",
        accelerator: "Ctrl+F",
        click: () => openFindBarFor(serviceId),
      },
      {
        label: "Zoom in",
        accelerator: "Ctrl+=",
        click: () => stepServiceZoom(serviceId, "in"),
      },
      {
        label: "Zoom out",
        accelerator: "Ctrl+-",
        click: () => stepServiceZoom(serviceId, "out"),
      },
      {
        label: "Reset zoom",
        accelerator: "Ctrl+0",
        enabled: getServiceZoom(serviceId) !== DEFAULT_ZOOM,
        click: () => stepServiceZoom(serviceId, "reset"),
      },
    );

    const mainWindow = getDeps()?.getMainWindow();
    if (mainWindow) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow });
    }
  });
}
