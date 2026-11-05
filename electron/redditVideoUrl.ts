// Picks a downloadable file for a video on Reddit. Pure (test/redditVideoUrl.test.ts).
//
// Reddit streams its videos as HLS through a blob: URL, with picture and sound
// in separate streams, so the <video> element's own src can't be downloaded.
// Its player element (<shreddit-player-2>, earlier <shreddit-player>) also
// lists ready-made MP4s with sound on packaged-media.redd.it, in a
// `packaged-media-json` attribute. That is what "Download Video" saves. The
// links are signed and expire, so they're read from the page at right-click
// time, never stored.

/** What the page probe (`redditVideoProbeScript`) reports for a right-click. */
export interface RedditVideoProbe {
  /** The player element's attributes that mention redd.it, by name. */
  attributes: Record<string, string>;
  /** The <video> element's current source, often a blob: URL. */
  videoSrc: string;
}

/** Whether a page URL is on Reddit (reddit.com or a subdomain). */
export function isRedditPage(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return hostname === "reddit.com" || hostname.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

function isRedditMediaUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "redd.it" || hostname.endsWith(".redd.it"));
  } catch {
    return false;
  }
}

interface Candidate {
  url: string;
  height: number;
}

function best(candidates: Candidate[]): string | null {
  const usable = candidates.filter((c) => isRedditMediaUrl(c.url));
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (b.height > a.height ? b : a)).url;
}

function fromPackagedJson(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const permutations = (parsed as { playbackMp4s?: { permutations?: unknown } } | null)
    ?.playbackMp4s?.permutations;
  if (!Array.isArray(permutations)) return null;
  const candidates: Candidate[] = [];
  for (const p of permutations) {
    const source = (p as { source?: { url?: unknown; dimensions?: { height?: unknown } } })?.source;
    if (typeof source?.url !== "string") continue;
    const height = source.dimensions?.height;
    candidates.push({ url: source.url, height: typeof height === "number" ? height : 0 });
  }
  return best(candidates);
}

const PACKAGED_URL = /https:\/\/packaged-media\.redd\.it\/[^\s"'<>\\]*(?:\\u0026[^\s"'<>\\]*)*/g;

// Fallback for when the JSON's shape changes: any packaged-media MP4 link in
// the player's attributes, the highest `res_<N>p` first.
function fromAnyAttribute(values: string[]): string | null {
  const candidates: Candidate[] = [];
  for (const value of values) {
    for (const match of value.matchAll(PACKAGED_URL)) {
      const url = match[0].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
      if (!/\.mp4(?:[?#]|$)/i.test(url)) continue;
      const res = /res_(\d+)p/i.exec(url);
      candidates.push({ url, height: res ? Number(res[1]) : 0 });
    }
  }
  return best(candidates);
}

// A plain video file (not a blob: stream or an HLS/DASH playlist), as Reddit
// uses for GIF-style posts.
function fromVideoSrc(src: string): string | null {
  if (!isRedditMediaUrl(src)) return null;
  const { pathname } = new URL(src);
  return /\.(?:m3u8|mpd)$/i.test(pathname) ? null : src;
}

/** The best file to download for a probed video, or null if there's none. */
export function pickRedditVideoUrl(probe: RedditVideoProbe): string | null {
  const packaged = probe.attributes["packaged-media-json"];
  return (
    (packaged ? fromPackagedJson(packaged) : null) ??
    fromAnyAttribute(Object.values(probe.attributes)) ??
    fromVideoSrc(probe.videoSrc)
  );
}

/** Narrows the untyped executeJavaScript result to a probe, or null. */
export function asRedditVideoProbe(value: unknown): RedditVideoProbe | null {
  if (!value || typeof value !== "object") return null;
  const { attributes, videoSrc } = value as { attributes?: unknown; videoSrc?: unknown };
  if (!attributes || typeof attributes !== "object") return null;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (typeof v === "string") clean[k] = v;
  }
  return { attributes: clean, videoSrc: typeof videoSrc === "string" ? videoSrc : "" };
}
