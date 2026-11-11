// Diagnostics for the "Messenger downloads a video as soon as you open it"
// report: one console line per download, popup request and hidden-popup
// navigation, so a single reproduction shows which path starts the download.
// Main-process console only (visible when the app is started from a terminal);
// remove once the cause is fixed. Pure, so it is tested without Electron.

/**
 * A URL safe to print and paste into a bug report: scheme, host and path, plus
 * the query parameter names (values dropped, since Facebook's media links carry
 * signed tokens). The `dl` flag Facebook uses to force a download is kept,
 * because it is the thing being looked for.
 */
export function redactUrlForLog(url: string): string {
  if (!url) return "(none)";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "(unparseable url)";
  }
  if (parsed.protocol === "blob:") return `blob:${redactUrlForLog(parsed.pathname)}`;
  if (parsed.protocol === "data:") return `data:${url.slice(5).split(/[;,]/, 1)[0]}…`;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return `${parsed.protocol}…`;
  const path = parsed.pathname.length > 80 ? `${parsed.pathname.slice(0, 80)}…` : parsed.pathname;
  const params = [...parsed.searchParams.keys()].map((key) =>
    key === "dl" ? `dl=${parsed.searchParams.get("dl") ?? ""}` : key,
  );
  return `${parsed.origin}${path}${params.length ? `?[${params.join(",")}]` : ""}`;
}

/** Where a download's webContents lives, as worked out by downloads.ts. */
export type DownloadSource = "service view" | "popup (hidden)" | "popup (visible)" | "unknown";

export interface DownloadLogInfo {
  partition: string;
  source: DownloadSource;
  webContentsId: number;
  /** The page the webContents was showing when the download started. */
  pageUrl: string;
  /** Every URL the request went through, redirects included. */
  urlChain: readonly string[];
  mimeType: string;
  filename: string;
  userGesture: boolean;
  totalBytes: number;
}

export function formatDownloadLog(info: DownloadLogInfo): string {
  const chain = info.urlChain.map(redactUrlForLog).join(" -> ") || "(none)";
  return [
    `[download] ${info.partition} from ${info.source} #${info.webContentsId}`,
    `page=${redactUrlForLog(info.pageUrl)}`,
    `chain=${chain}`,
    `mime=${info.mimeType || "(none)"}`,
    `file=${info.filename || "(none)"}`,
    `gesture=${info.userGesture}`,
    `bytes=${info.totalBytes}`,
  ].join(" | ");
}

/** A service page asked to open a window (setWindowOpenHandler). */
export function formatPopupRequestLog(
  partition: string,
  webContentsId: number,
  url: string,
  disposition: string,
): string {
  return `[popup] ${partition} #${webContentsId} asked for ${disposition}: ${redactUrlForLog(url)}`;
}

/** A hidden Messenger popup navigated somewhere real (callWindow.ts). */
export function formatHiddenPopupLog(
  partition: string,
  webContentsId: number,
  url: string,
  outcome: "call window" | "shown" | "ignored, stays hidden",
): string {
  return `[popup] ${partition} hidden popup #${webContentsId} went to ${redactUrlForLog(url)} -> ${outcome}`;
}
