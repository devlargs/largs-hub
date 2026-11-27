import path from "node:path";
import type { StoreSchema } from "./store";
import type { CloudWorkspace, CloudWorkspaceKey, Service } from "./shared/types";
import { sanitizeService } from "./serviceSchema";
import { sanitizeLockDelayMinutes } from "./lockPolicy";
import { sanitizeStoredGroups } from "./messageLists";
import { sanitizeRecentEmojis } from "./recentEmojis";
import { sanitizeStoredPrefs } from "./automationPrefs";
import { DEFAULT_ZOOM, sanitizeZoom } from "./zoom";
import { customIconFileName } from "./iconCleanup";
import { restorableTasks, sanitizeAutoStops } from "./automationRestore";
import { validateSpec } from "./messengerAutomation/validation";
import { sanitizeVault } from "./passcodes/cloudCrypto";
import {
  DEFAULT_WINDOW_SIZE,
  sanitizeCloudCredential,
  sanitizeHomeRelative,
  sanitizeWindowSize,
  toHomeRelative,
  type PathApi,
} from "./cloudDeviceSettings";

// What the account syncs between computers, and the checks a workspace read
// back from the cloud has to pass before it reaches the store.
//
// Pure (no electron imports) so it can be unit-tested: ipc/cloud.ts owns the
// store and the side effects of applying one.
//
// Synced: SYNCED_KEYS below, copied as they are, plus two that are translated
// for the other computer (cloudDeviceSettings.ts): the window's size (its
// position stays here) and the download folder, as a path under the home
// folder. Never synced, because it only means something on this computer or
// belongs to this install:
//   windowBounds x/y               - this screen's layout
//   lastActiveServiceId            - where you were on this computer
//   lastGoogleSignInServiceId      - points at a login, and logins don't sync
//   unlockThrottle                 - wrong-password attempts made here
//   passcodes                      - while signed in they live in the account
//                                    only, encrypted end to end (passcodes/)
//   cloudDeviceId                  - identifies this computer to the account

// The workspace keys that aren't a store key of the same name and type
type TranslatedKey = "windowSize" | "downloadFolderInHome" | "passcodeVault";
export type SyncedStoreKey = Exclude<CloudWorkspaceKey, TranslatedKey>;

export const SYNCED_KEYS: readonly SyncedStoreKey[] = [
  "services",
  "wakeServicesAutomatically",
  "openFolderOnFinish",
  "openFileOnFinish",
  "downloadAlertOnFinish",
  "hibernateInactiveMinutes",
  "closeToTray",
  "minimizeToTray",
  "privacyCoverPercent",
  "privacyOpacity",
  "privacyHorizontalPercent",
  "privacyHorizontalOpacity",
  "serviceZoom",
  "messageListGroups",
  "recentEmojis",
  "automationPrefs",
  "lockDelayMinutes",
  "autoLockDisabled",
  "securityControlsEnabled",
  "masterPasswordCredential",
  "launchAtStartup",
  "debugMode",
  "windowMaximized",
  "automationTasks",
  "automationAutoStops",
];

// The store keys a change to which means there's something to push
export const WATCHED_STORE_KEYS: readonly (keyof StoreSchema)[] = [
  ...SYNCED_KEYS,
  "windowBounds",
  "downloadFolder",
];

// Fails to compile if a synced key isn't a store key of the same type.
type SyncedStoreFields = Pick<StoreSchema, SyncedStoreKey>;
const _sameShape: (
  w: Omit<CloudWorkspace, "schemaVersion" | TranslatedKey>,
) => SyncedStoreFields = (w) => w;

// Firestore's limit is 1 MiB per document; leave room for the doc's own fields.
export const MAX_WORKSPACE_BYTES = 900_000;

// The store's defaults, used for a field the cloud copy is missing or has wrong.
const DEFAULTS: Omit<CloudWorkspace, "schemaVersion" | "services"> = {
  wakeServicesAutomatically: true,
  openFolderOnFinish: true,
  openFileOnFinish: false,
  downloadAlertOnFinish: true,
  hibernateInactiveMinutes: 0,
  closeToTray: false,
  minimizeToTray: false,
  privacyCoverPercent: 50,
  privacyOpacity: 100,
  privacyHorizontalPercent: 0,
  privacyHorizontalOpacity: 100,
  serviceZoom: {},
  messageListGroups: [],
  recentEmojis: [],
  automationPrefs: {},
  lockDelayMinutes: 10,
  autoLockDisabled: false,
  securityControlsEnabled: false,
  masterPasswordCredential: null,
  launchAtStartup: false,
  debugMode: false,
  windowMaximized: true,
  windowSize: DEFAULT_WINDOW_SIZE,
  downloadFolderInHome: null,
  automationTasks: [],
  automationAutoStops: [],
  passcodeVault: null,
};

const BOOLEAN_KEYS = [
  "wakeServicesAutomatically",
  "openFolderOnFinish",
  "openFileOnFinish",
  "downloadAlertOnFinish",
  "closeToTray",
  "minimizeToTray",
  "autoLockDisabled",
  "launchAtStartup",
  "debugMode",
  "windowMaximized",
] as const;

const PERCENT_KEYS = [
  "privacyCoverPercent",
  "privacyOpacity",
  "privacyHorizontalPercent",
  "privacyHorizontalOpacity",
] as const;

export interface SanitizeOptions {
  // Whether an uploaded icon file exists on this computer. A service whose
  // custom icon isn't here falls back to its built-in icon (icon files don't
  // sync yet). Left out, every icon is kept as it is.
  iconExists?: (fileName: string) => boolean;
  // The services already on this computer. A service this computer has a
  // custom icon for keeps it when the cloud copy has none (or one whose file
  // isn't here), so a computer without the file can't wipe the icon from the
  // one that has it.
  localServices?: readonly Service[];
}

// Services the same way add-service checks them, one bad or repeated entry
// dropped rather than the whole list.
function sanitizeServices(raw: unknown, options: SanitizeOptions): Service[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const services: Service[] = [];
  for (const entry of raw) {
    const service = sanitizeService(entry);
    if (!service || seen.has(service.id)) continue;
    seen.add(service.id);
    if (options.iconExists) service.icon = resolveIcon(service, options);
    services.push(service);
  }
  return services;
}

function resolveIcon(service: Service, options: SanitizeOptions): string {
  const exists = (icon: unknown) => {
    const file = customIconFileName(icon);
    return file !== null && options.iconExists!(file);
  };
  if (exists(service.icon)) return service.icon;
  const incomingIsCustom = customIconFileName(service.icon) !== null;
  if (service.icon && !incomingIsCustom) return service.icon; // a built-in icon
  const local = options.localServices?.find((s) => s.id === service.id);
  if (local && exists(local.icon)) return local.icon;
  return ""; // the built-in icon for the service's name
}

function sanitizeServiceZoom(raw: unknown, serviceIds: readonly string[]): Record<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const zoom: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!serviceIds.includes(id)) continue;
    const factor = sanitizeZoom(value);
    if (factor !== DEFAULT_ZOOM) zoom[id] = factor;
  }
  return zoom;
}

// The same rules update-setting applies.
function percent(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

function minutes(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return fallback;
  return Math.floor(raw);
}

// One canonical shape for both directions, so a workspace read from the store
// and the same workspace read back from the cloud fingerprint the same.
function normalize(r: Record<string, unknown>, options: SanitizeOptions): CloudWorkspace {
  const services = sanitizeServices(r.services, options);
  const ids = services.map((s) => s.id);
  const workspace: CloudWorkspace = {
    schemaVersion: 1,
    ...DEFAULTS,
    services,
    hibernateInactiveMinutes: minutes(
      r.hibernateInactiveMinutes,
      DEFAULTS.hibernateInactiveMinutes,
    ),
    serviceZoom: sanitizeServiceZoom(r.serviceZoom, ids),
    messageListGroups: sanitizeStoredGroups(r.messageListGroups),
    recentEmojis: sanitizeRecentEmojis(r.recentEmojis),
    automationPrefs: sanitizeStoredPrefs(r.automationPrefs, ids),
    lockDelayMinutes: sanitizeLockDelayMinutes(r.lockDelayMinutes),
    masterPasswordCredential: sanitizeCloudCredential(r.masterPasswordCredential),
    windowSize: sanitizeWindowSize(r.windowSize),
    downloadFolderInHome: sanitizeHomeRelative(r.downloadFolderInHome),
    // A task from the account passes the same check as one started here
    automationTasks: restorableTasks(r.automationTasks, ids).filter(
      (task) => validateSpec(task.spec) === null,
    ),
    automationAutoStops: sanitizeAutoStops(r.automationAutoStops, ids),
    // Sealed: main checks its shape here and opens it only with the key
    passcodeVault: sanitizeVault(r.passcodeVault),
  };
  // A lock with no password can't lock anything, so it can't arrive switched on
  workspace.securityControlsEnabled =
    r.securityControlsEnabled === true && workspace.masterPasswordCredential !== null;
  for (const key of BOOLEAN_KEYS) {
    workspace[key] = typeof r[key] === "boolean" ? r[key] : DEFAULTS[key];
  }
  for (const key of PERCENT_KEYS) workspace[key] = percent(r[key], DEFAULTS[key]);
  return workspace;
}

/**
 * The synced part of the store, and nothing else. `home` is this computer's
 * home folder, which the download folder is stored relative to.
 */
export function pickCloudWorkspace(
  store: Partial<StoreSchema>,
  home: string,
  pathApi: PathApi = path,
): CloudWorkspace {
  const raw: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) raw[key] = store[key];
  raw.windowSize = store.windowBounds;
  raw.downloadFolderInHome = toHomeRelative(store.downloadFolder ?? "", home, pathApi);
  return normalize(raw, {});
}

/**
 * A workspace from the cloud, checked like anything else crossing into the
 * store. Bad entries are dropped and bad values fall back to the defaults;
 * null only when it isn't a workspace at all or is from a newer schema.
 */
export function sanitizeCloudWorkspace(
  raw: unknown,
  options: SanitizeOptions = {},
): CloudWorkspace | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) return null;
  return normalize(r, options);
}

export { workspaceFingerprint, workspaceSize } from "./cloudFingerprint";
