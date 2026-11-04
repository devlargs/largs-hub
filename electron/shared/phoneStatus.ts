// The paired phone's status as Google Messages for web shows it.
//
// The page never gets a battery percentage or signal strength from the phone,
// only banners: battery low, on mobile data, can't reach the phone. So this is
// coarse and best effort, read from the banners' English text. When Google
// rewords one, update PATTERNS below.
//
// Pure, no `electron` or `node:` imports (it's shared with the renderer).

export interface PhoneStatus {
  battery: "low" | "ok";
  connection: "wifi" | "mobile" | "unknown";
  reachable: boolean;
}

/** What the page script returns: whether a phone is paired, and the banner texts. */
export interface PhoneStatusReading {
  paired: boolean;
  banners: string[];
}

export const PATTERNS = {
  batteryLow: /battery\b.*\blow|low battery/i,
  batteryOk: /battery\b.*\b(restored|charging|charged)/i,
  mobileData: /mobile data|cellular data/i,
  wifi: /\bwi-?fi\b/i,
  unreachable:
    /trying to (reach|connect)|can['’]?t (reach|connect)|cannot (reach|connect)|not connected|phone (is )?offline|reconnecting/i,
} as const;

/** The status the banners describe, or null when no phone is paired. */
export function parsePhoneStatus(
  reading: PhoneStatusReading | null | undefined,
): PhoneStatus | null {
  if (!reading || !reading.paired) return null;
  const banners = Array.isArray(reading.banners)
    ? reading.banners.filter((b): b is string => typeof b === "string")
    : [];
  const any = (re: RegExp) => banners.some((b) => re.test(b));
  const battery = any(PATTERNS.batteryLow) && !any(PATTERNS.batteryOk) ? "low" : "ok";
  const connection = any(PATTERNS.mobileData) ? "mobile" : any(PATTERNS.wifi) ? "wifi" : "unknown";
  return { battery, connection, reachable: !any(PATTERNS.unreachable) };
}

export function phoneStatusEqual(a: PhoneStatus | null, b: PhoneStatus | null): boolean {
  if (a === null || b === null) return a === b;
  return a.battery === b.battery && a.connection === b.connection && a.reachable === b.reachable;
}

/** True for a service on Google Messages for web. */
export function isGoogleMessagesHost(host: string): boolean {
  return host === "messages.google.com";
}
