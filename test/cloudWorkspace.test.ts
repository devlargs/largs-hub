import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  pickCloudWorkspace,
  sanitizeCloudWorkspace,
  SYNCED_KEYS,
  workspaceFingerprint,
} from "../electron/cloudWorkspace";
import type { StoreSchema } from "../electron/store";

// What syncs with the account (cloudWorkspace.ts): only the allowlisted keys go
// up, and anything coming down is checked like any other IPC payload.

const service = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Service ${id}`,
  url: `https://${id}.example.com`,
  icon: "gmail.png",
  color: "#123456",
  notificationCount: 3,
  ...extra,
});

const CREDENTIAL = {
  algorithm: "scrypt",
  salt: "ab12",
  hash: "cd34",
  keyLength: 64,
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
};

const HOME = "C:\\Users\\me";
const pick = (store: StoreSchema) => pickCloudWorkspace(store, HOME, path.win32);

const fullStore = {
  services: [service("a"), service("b", { muted: true })],
  windowBounds: { width: 1400, height: 900, x: 30, y: 40 },
  windowMaximized: false,
  lastActiveServiceId: "a",
  lastGoogleSignInServiceId: "a",
  downloadFolder: "C:\\Users\\me\\Downloads",
  wakeServicesAutomatically: false,
  launchAtStartup: true,
  openFolderOnFinish: false,
  openFileOnFinish: true,
  downloadAlertOnFinish: false,
  hibernateInactiveMinutes: 30,
  privacyCoverPercent: 40,
  privacyOpacity: 90,
  privacyHorizontalPercent: 10,
  privacyHorizontalOpacity: 80,
  debugMode: true,
  serviceZoom: { a: 1.25 },
  messageListGroups: [],
  recentEmojis: ["👍"],
  closeToTray: true,
  minimizeToTray: false,
  automationTasks: [
    {
      id: "t",
      serviceId: "a",
      spec: { type: "sendChat", message: "hi", time: "0930" },
      status: "running",
      nextFireAt: 5,
      fireCount: 0,
      createdAt: 1,
    },
  ],
  automationAutoStops: [{ serviceId: "a", minutes: 30, expiresAt: 99 }],
  automationPrefs: { a: { type: "sendChat", time: "09:30" } },
  securityControlsEnabled: true,
  masterPasswordCredential: CREDENTIAL,
  lockDelayMinutes: 30,
  autoLockDisabled: true,
  unlockThrottle: { failures: 2, blockedUntil: null },
  passcodes: [{ id: "p", secret: "enc:abc" }],
  cloudDeviceId: "device-1",
} as unknown as StoreSchema;

describe("pickCloudWorkspace", () => {
  const workspace = pick(fullStore);

  it("holds the allowlisted keys and the translated ones, nothing else", () => {
    expect(Object.keys(workspace).sort()).toEqual(
      [
        "schemaVersion",
        "windowSize",
        "downloadFolderInHome",
        "passcodeVault",
        ...SYNCED_KEYS,
      ].sort(),
    );
  });

  it("never carries this computer's own state or the local passcodes", () => {
    for (const key of [
      "passcodes",
      "downloadFolder",
      "windowBounds",
      "cloudDeviceId",
      "unlockThrottle",
      "lastActiveServiceId",
    ]) {
      expect(workspace).not.toHaveProperty(key);
    }
    expect(JSON.stringify(workspace)).not.toContain("enc:abc");
  });

  it("carries the lock, startup, debug, window and automation settings", () => {
    expect(workspace).toMatchObject({
      securityControlsEnabled: true,
      masterPasswordCredential: CREDENTIAL,
      launchAtStartup: true,
      debugMode: true,
      windowMaximized: false,
      windowSize: { width: 1400, height: 900 },
      downloadFolderInHome: "Downloads",
    });
    expect(workspace.automationTasks.map((t) => t.id)).toEqual(["t"]);
    expect(workspace.automationAutoStops).toEqual([{ serviceId: "a", minutes: 30, expiresAt: 99 }]);
  });

  it("leaves a download folder outside the home folder unsynced", () => {
    expect(pick({ ...fullStore, downloadFolder: "D:\\Downloads" }).downloadFolderInHome).toBeNull();
    expect(pick({ ...fullStore, downloadFolder: "" }).downloadFolderInHome).toBe("");
  });

  it("keeps the synced values", () => {
    expect(workspace.services.map((s) => s.id)).toEqual(["a", "b"]);
    expect(workspace.services[1].muted).toBe(true);
    expect(workspace.services[0].notificationCount).toBe(0);
    expect(workspace).toMatchObject({
      wakeServicesAutomatically: false,
      hibernateInactiveMinutes: 30,
      closeToTray: true,
      privacyCoverPercent: 40,
      serviceZoom: { a: 1.25 },
      recentEmojis: ["👍"],
      lockDelayMinutes: 30,
      autoLockDisabled: true,
      automationPrefs: { a: { type: "sendChat", time: "09:30" } },
    });
  });
});

describe("sanitizeCloudWorkspace", () => {
  const valid = () => ({ ...pick(fullStore) }) as Record<string, unknown>;

  it("rejects anything that isn't a version 1 workspace", () => {
    expect(sanitizeCloudWorkspace(null)).toBeNull();
    expect(sanitizeCloudWorkspace("workspace")).toBeNull();
    expect(sanitizeCloudWorkspace([])).toBeNull();
    expect(sanitizeCloudWorkspace({ ...valid(), schemaVersion: 2 })).toBeNull();
    expect(sanitizeCloudWorkspace({ ...valid(), schemaVersion: undefined })).toBeNull();
  });

  it("drops invalid and repeated services, keeping the rest in order", () => {
    const result = sanitizeCloudWorkspace({
      ...valid(),
      services: [
        service("a"),
        { id: "", name: "x", url: "https://x.com" },
        service("bad", { url: "javascript:alert(1)" }),
        "nope",
        service("a", { name: "Duplicate" }),
        service("c"),
      ],
    });
    expect(result?.services.map((s) => s.id)).toEqual(["a", "c"]);
    expect(result?.services[0].name).toBe("Service a");
  });

  it("clamps privacy values to 0-100", () => {
    const result = sanitizeCloudWorkspace({
      ...valid(),
      privacyCoverPercent: 250,
      privacyOpacity: -20,
      privacyHorizontalPercent: 33.6,
      privacyHorizontalOpacity: "50",
    });
    expect(result).toMatchObject({
      privacyCoverPercent: 100,
      privacyOpacity: 0,
      privacyHorizontalPercent: 34,
      privacyHorizontalOpacity: 100,
    });
  });

  it("sanitizes the lock delay and the hibernation time", () => {
    expect(sanitizeCloudWorkspace({ ...valid(), lockDelayMinutes: 7 })?.lockDelayMinutes).toBe(10);
    expect(sanitizeCloudWorkspace({ ...valid(), lockDelayMinutes: 5 })?.lockDelayMinutes).toBe(5);
    expect(
      sanitizeCloudWorkspace({ ...valid(), hibernateInactiveMinutes: -5 })
        ?.hibernateInactiveMinutes,
    ).toBe(0);
    expect(
      sanitizeCloudWorkspace({ ...valid(), hibernateInactiveMinutes: 60.7 })
        ?.hibernateInactiveMinutes,
    ).toBe(60);
  });

  it("falls back to defaults for wrongly typed settings", () => {
    const result = sanitizeCloudWorkspace({
      ...valid(),
      closeToTray: "yes",
      wakeServicesAutomatically: 0,
    });
    expect(result?.closeToTray).toBe(false);
    expect(result?.wakeServicesAutomatically).toBe(true);
  });

  it("keeps zoom and automation settings only for services in the workspace", () => {
    const result = sanitizeCloudWorkspace({
      ...valid(),
      serviceZoom: { a: 1.5, gone: 2, b: 99 },
      automationPrefs: { a: { type: "sendEmoji" }, gone: { type: "sendChat" } },
    });
    expect(result?.serviceZoom).toEqual({ a: 1.5 });
    expect(result?.automationPrefs).toEqual({ a: { type: "sendEmoji" } });
  });

  it("drops invalid message lists and emojis", () => {
    const result = sanitizeCloudWorkspace({
      ...valid(),
      messageListGroups: [
        { id: "g", name: "Greetings", messages: ["hi"], createdAt: 1, updatedAt: 2 },
        { id: "", name: "Bad", messages: ["x"] },
      ],
      recentEmojis: ["🎉", 5, "", "🎉"],
    });
    expect(result?.messageListGroups.map((g) => g.id)).toEqual(["g"]);
    expect(result?.recentEmojis).toEqual(["🎉"]);
  });

  it("drops a custom icon whose file isn't on this computer", () => {
    const result = sanitizeCloudWorkspace(
      { ...valid(), services: [service("a", { icon: "custom:missing.png" })] },
      { iconExists: () => false },
    );
    expect(result?.services[0].icon).toBe("");
  });

  it("keeps this computer's own custom icon when the cloud copy has none", () => {
    const result = sanitizeCloudWorkspace(
      { ...valid(), services: [service("a", { icon: "" })] },
      {
        iconExists: (file) => file === "mine.png",
        localServices: [service("a", { icon: "custom:mine.png" }) as never],
      },
    );
    expect(result?.services[0].icon).toBe("custom:mine.png");
  });

  it("keeps a custom icon that exists, and built-in icons", () => {
    const result = sanitizeCloudWorkspace(
      {
        ...valid(),
        services: [service("a", { icon: "custom:here.png" }), service("b", { icon: "slack.png" })],
      },
      { iconExists: (file) => file === "here.png" },
    );
    expect(result?.services.map((s) => s.icon)).toEqual(["custom:here.png", "slack.png"]);
  });

  it("switches the lock off when it arrives without a usable password", () => {
    const noPassword = sanitizeCloudWorkspace({ ...valid(), masterPasswordCredential: null });
    expect(noPassword?.securityControlsEnabled).toBe(false);
    const costly = sanitizeCloudWorkspace({
      ...valid(),
      masterPasswordCredential: { ...CREDENTIAL, cost: 1 << 20 },
    });
    expect(costly?.masterPasswordCredential).toBeNull();
    expect(costly?.securityControlsEnabled).toBe(false);
  });

  it("drops automation for missing services, bad specs and bad auto-stops", () => {
    const task = (fullStore.automationTasks as unknown[])[0] as Record<string, unknown>;
    const result = sanitizeCloudWorkspace({
      ...valid(),
      automationTasks: [
        task,
        { ...task, id: "gone", serviceId: "gone" },
        { ...task, id: "bad", spec: { type: "sendChat", message: "", time: "0930" } },
      ],
      automationAutoStops: [
        { serviceId: "a", minutes: 30, expiresAt: 99 },
        { serviceId: "a", minutes: 10, expiresAt: 5 },
        { serviceId: "b", minutes: -1, expiresAt: 5 },
        { serviceId: "gone", minutes: 5, expiresAt: 5 },
      ],
    });
    expect(result?.automationTasks.map((t) => t.id)).toEqual(["t"]);
    expect(result?.automationAutoStops.map((a) => a.serviceId)).toEqual(["a"]);
  });

  it("refuses a download folder that leaves the home folder or enters app data", () => {
    for (const bad of ["../x", "AppData/Roaming", "Library/LaunchAgents", ".ssh", "a//b", "C:"]) {
      expect(
        sanitizeCloudWorkspace({ ...valid(), downloadFolderInHome: bad })?.downloadFolderInHome,
      ).toBeNull();
    }
  });

  it("keeps a sealed passcode vault and drops a malformed one", () => {
    const vault = {
      keyring: { v: 1, salt: "c2FsdA==", iterations: 600000, iv: "aXY=", wrappedKey: "d3I=" },
      data: "QUJD",
    };
    expect(sanitizeCloudWorkspace({ ...valid(), passcodeVault: vault })?.passcodeVault).toEqual(
      vault,
    );
    expect(
      sanitizeCloudWorkspace({ ...valid(), passcodeVault: { ...vault, data: 5 } })?.passcodeVault,
    ).toBeNull();
    // The store never holds the account's passcodes, so a picked workspace has none
    expect(pick(fullStore).passcodeVault).toBeNull();
  });

  it("round-trips a picked workspace unchanged", () => {
    const picked = pick(fullStore);
    expect(sanitizeCloudWorkspace(JSON.parse(JSON.stringify(picked)))).toEqual(picked);
  });
});

describe("workspaceFingerprint", () => {
  it("doesn't depend on key order", () => {
    const workspace = pick(fullStore);
    const reversed = Object.fromEntries(Object.entries(workspace).reverse()) as typeof workspace;
    reversed.services = workspace.services.map(
      (s) => Object.fromEntries(Object.entries(s).reverse()) as typeof s,
    );
    expect(workspaceFingerprint(reversed)).toBe(workspaceFingerprint(workspace));
  });

  it("changes when the workspace does", () => {
    const workspace = pick(fullStore);
    expect(workspaceFingerprint({ ...workspace, closeToTray: !workspace.closeToTray })).not.toBe(
      workspaceFingerprint(workspace),
    );
  });

  it("matches between the store and the same workspace read back from the cloud", () => {
    const picked = pick(fullStore);
    const fromCloud = sanitizeCloudWorkspace(JSON.parse(JSON.stringify(picked)))!;
    expect(workspaceFingerprint(fromCloud)).toBe(workspaceFingerprint(picked));
  });
});
