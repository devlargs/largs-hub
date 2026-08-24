// Layout geometry shared by the main process and the renderer.
//
// Native WebContentsView bounds and the CSS drawn around them have to agree
// exactly — a service view is positioned in main from these numbers while React
// draws the sidebar, titlebar and modal chrome around it. They used to be typed
// out in both layers with comments asking future readers to keep them in step;
// this module is the single source instead (issue #81).
//
// Rules for anything added here: pure values and pure functions only, no
// `electron` or `node:` imports. The file is compiled into the main bundle by
// tsconfig.electron.json and pulled into the renderer bundle by Vite through
// the `@shared` alias, so anything platform-specific would break one of them.

/** Width of the service rail down the left edge. */
export const SIDEBAR_WIDTH = 68;

/** Height of the custom (frameless) titlebar. */
export const TITLEBAR_HEIGHT = 46;

/** Height of the find-in-page strip, when open, below the titlebar. */
export const FIND_BAR_HEIGHT = 44;

/** Gap between the link-preview modal and the window edge. */
export const LINK_PREVIEW_MARGIN = 40;

/** Height of the link-preview modal's header, above the embedded page. */
export const LINK_PREVIEW_HEADER = 52;

/** The link-preview modal never grows past this, however wide the window is. */
export const LINK_PREVIEW_MAX_WIDTH = 1100;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the embedded page sits inside the link-preview modal, given the
 * window's content size. Main uses it to place the native view; the renderer
 * uses the same numbers to draw the chrome around it.
 */
export function linkPreviewBounds(windowWidth: number, windowHeight: number): Bounds {
  const modalWidth = Math.min(LINK_PREVIEW_MAX_WIDTH, windowWidth - LINK_PREVIEW_MARGIN * 2);
  return {
    x: Math.round((windowWidth - modalWidth) / 2),
    y: LINK_PREVIEW_MARGIN + LINK_PREVIEW_HEADER,
    width: Math.max(0, modalWidth),
    height: Math.max(0, windowHeight - LINK_PREVIEW_MARGIN * 2 - LINK_PREVIEW_HEADER),
  };
}
