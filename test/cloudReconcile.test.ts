import { describe, expect, it } from "vitest";
import { decideReconcile, shouldClaimOnStart, syncStatusLabel } from "../src/lib/cloudReconcile";

describe("decideReconcile", () => {
  it("seeds an account that has no workspace yet", () => {
    expect(
      decideReconcile({ cloudDocExists: false, syncedBefore: false, localServiceCount: 3 }),
    ).toBe("push");
  });

  it("takes the account's workspace once this computer has synced before", () => {
    expect(
      decideReconcile({ cloudDocExists: true, syncedBefore: true, localServiceCount: 3 }),
    ).toBe("apply");
  });

  it("takes it silently when this computer has no services", () => {
    expect(
      decideReconcile({ cloudDocExists: true, syncedBefore: false, localServiceCount: 0 }),
    ).toBe("apply");
  });

  it("asks when both have a workspace and they've never synced", () => {
    expect(
      decideReconcile({ cloudDocExists: true, syncedBefore: false, localServiceCount: 2 }),
    ).toBe("ask");
  });
});

describe("shouldClaimOnStart", () => {
  const base = { myDeviceId: "me", interactive: false, launchedAtLogin: true };

  it("claims a free session, or one that's already this computer's", () => {
    expect(shouldClaimOnStart({ ...base, activeDeviceId: null })).toBe(true);
    expect(shouldClaimOnStart({ ...base, activeDeviceId: undefined })).toBe(true);
    expect(shouldClaimOnStart({ ...base, activeDeviceId: "me" })).toBe(true);
  });

  it("doesn't take another computer's session on a launch at sign-in", () => {
    expect(shouldClaimOnStart({ ...base, activeDeviceId: "other" })).toBe(false);
  });

  it("takes it on a normal launch, or right after signing in", () => {
    expect(shouldClaimOnStart({ ...base, activeDeviceId: "other", launchedAtLogin: false })).toBe(
      true,
    );
    expect(shouldClaimOnStart({ ...base, activeDeviceId: "other", interactive: true })).toBe(true);
  });
});

describe("syncStatusLabel", () => {
  const NOW = 1_700_000_000_000;

  it("says how long ago the last sync was", () => {
    expect(syncStatusLabel({ status: "synced", lastSyncedAt: NOW - 5_000 }, NOW)).toBe(
      "Last synced just now",
    );
    expect(syncStatusLabel({ status: "synced", lastSyncedAt: NOW - 120_000 }, NOW)).toBe(
      "Last synced 2 min ago",
    );
    expect(syncStatusLabel({ status: "synced", lastSyncedAt: NOW - 3 * 3_600_000 }, NOW)).toBe(
      "Last synced 3 hours ago",
    );
  });

  it("explains offline and errors", () => {
    expect(syncStatusLabel({ status: "offline" }, NOW)).toBe(
      "Offline. Changes will sync when you're back online.",
    );
    expect(
      syncStatusLabel({ status: "error", error: "Your workspace is too large to sync." }, NOW),
    ).toBe("Sync error: Your workspace is too large to sync.");
  });
});
