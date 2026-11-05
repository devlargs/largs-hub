import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from "electron";
import { asRedditVideoProbe, isRedditPage, pickRedditVideoUrl } from "../redditVideoUrl";
import { buildRedditVideoProbeScript } from "./scripts";

// How long the right-click menu may wait on the page to say what video is
// under the cursor. A page that's busy past this just gets no video item.
const PROBE_TIMEOUT_MS = 400;

/** Whether a right-click should probe for a Reddit video before the menu opens. */
export function wantsRedditVideoProbe(wc: WebContents, params: ContextMenuParams): boolean {
  return !params.isEditable && isRedditPage(wc.getURL());
}

/**
 * The "Download Video" item for a right-click on a Reddit video: enabled with
 * the file to save, disabled when the player offers no downloadable file, and
 * nothing at all when there's no video under the cursor.
 */
export async function redditVideoMenuItems(
  wc: WebContents,
  params: ContextMenuParams,
): Promise<MenuItemConstructorOptions[]> {
  // Menu coordinates are in view pixels; the page hit-tests in CSS pixels.
  const zoom = wc.getZoomFactor() || 1;
  const script = buildRedditVideoProbeScript(params.x / zoom, params.y / zoom);
  let raw: unknown;
  try {
    raw = await Promise.race([
      wc.executeJavaScript(script, true),
      new Promise((resolve) => setTimeout(() => resolve(null), PROBE_TIMEOUT_MS)),
    ]);
  } catch {
    return [];
  }
  const probe = asRedditVideoProbe(raw);
  if (!probe) return [];
  const url = pickRedditVideoUrl(probe);
  if (!url) return [{ label: "Download Video (not available)", enabled: false }];
  return [{ label: "Download Video", click: () => wc.downloadURL(url) }];
}
