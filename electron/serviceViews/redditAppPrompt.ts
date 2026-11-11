import type { WebContentsView } from "electron";
import { isRedditPage } from "../redditVideoUrl";
import { REMOVE_REDDIT_APP_PROMPT_SCRIPT } from "./scripts";

// Reddit's "Get the Reddit App" sheet can't be closed (scripts.ts), so each
// Reddit page load gets the script that removes it. Checked against the page
// URL rather than the service's, so a Custom service that lands on Reddit is
// covered too, and nothing runs on any other site.
export function attachRedditAppPromptBlocker(view: WebContentsView) {
  const contents = view.webContents;
  contents.on("dom-ready", () => {
    if (contents.isDestroyed() || !isRedditPage(contents.getURL())) return;
    contents.executeJavaScript(REMOVE_REDDIT_APP_PROMPT_SCRIPT, true).catch(() => {});
  });
}
