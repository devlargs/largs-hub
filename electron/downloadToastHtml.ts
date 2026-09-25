// Markup for the download-complete toast. Pure, so the escaping and the
// per-platform wording are unit-tested (test/downloadToastHtml.test.ts); the
// window itself lives in downloadToast.ts.

// Sentinels the toast's links "navigate" to. The toast page has no preload, so
// a click signals the main process by starting a navigation that main cancels.
// Never actually loaded.
export const CLOSE_URL = "https://largs.invalid/close-toast";
export const OPEN_LOCATION_URL = "https://largs.invalid/open-location";

/** The toast's "show me the file" link, in the words each OS uses for it. */
export function openLocationLabel(platform: NodeJS.Platform): string {
  return platform === "darwin" ? "Show in Finder" : "Open file location";
}

// Escape HTML metacharacters — a filename is arbitrary text going into markup.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toastHtml(label: string, fileName: string, platform: NodeJS.Platform): string {
  return `<html><body style="margin:0;font-family:Segoe UI,-apple-system,sans-serif;background:transparent;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(30,30,46,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#cdd6f4;font-size:13px;backdrop-filter:blur(12px);">
        <span id="label" style="color:#89b4fa;font-weight:600;white-space:nowrap;">${escapeHtml(label)}</span>
        <span id="file" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a6adc8;">${escapeHtml(fileName)}</span>
        <a class="action" href="${OPEN_LOCATION_URL}" style="flex:none;padding:3px 8px;border-radius:6px;color:#89b4fa;text-decoration:none;white-space:nowrap;-webkit-user-select:none;">${escapeHtml(openLocationLabel(platform))}</a>
        <a class="close" href="${CLOSE_URL}" title="Close" style="flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:-4px;border-radius:6px;color:#a6adc8;text-decoration:none;font-size:15px;line-height:1;-webkit-user-select:none;">&#10005;</a>
      </div>
      <style>a:hover{background:rgba(255,255,255,0.12);}a.close:hover{color:#cdd6f4;}</style>
    </body></html>`;
}
