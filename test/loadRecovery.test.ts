import { describe, expect, it } from "vitest";
import {
  RETRY_DELAYS_MS,
  STALLED_LOAD_MS,
  isRetryableLoadFailure,
  retryDelayMs,
  shouldReloadOnShow,
} from "../electron/loadRecovery";

describe("isRetryableLoadFailure", () => {
  it("retries a main-frame network failure", () => {
    expect(isRetryableLoadFailure(-106, true)).toBe(true); // ERR_INTERNET_DISCONNECTED
    expect(isRetryableLoadFailure(-105, true)).toBe(true); // ERR_NAME_NOT_RESOLVED
    expect(isRetryableLoadFailure(-21, true)).toBe(true); // ERR_NETWORK_CHANGED
  });

  it("leaves cancelled and blocked navigations alone", () => {
    expect(isRetryableLoadFailure(-3, true)).toBe(false); // ERR_ABORTED
    expect(isRetryableLoadFailure(-20, true)).toBe(false); // ERR_BLOCKED_BY_CLIENT
  });

  it("ignores iframes", () => {
    expect(isRetryableLoadFailure(-106, false)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off, then stops", () => {
    expect(retryDelayMs(0)).toBe(RETRY_DELAYS_MS[0]);
    expect(retryDelayMs(1)).toBeGreaterThan(retryDelayMs(0)!);
    expect(retryDelayMs(RETRY_DELAYS_MS.length)).toBeNull();
  });
});

describe("shouldReloadOnShow", () => {
  const now = 100_000;

  it("reloads a page whose load failed", () => {
    expect(shouldReloadOnShow({ failedUrl: "https://a.example", loadingSince: null }, now)).toBe(
      true,
    );
  });

  it("reloads a load that has been stuck too long", () => {
    const loadingSince = now - STALLED_LOAD_MS;
    expect(shouldReloadOnShow({ failedUrl: null, loadingSince }, now)).toBe(true);
  });

  it("lets a recent load carry on", () => {
    const loadingSince = now - STALLED_LOAD_MS + 1;
    expect(shouldReloadOnShow({ failedUrl: null, loadingSince }, now)).toBe(false);
  });

  it("leaves a loaded page alone", () => {
    expect(shouldReloadOnShow({ failedUrl: null, loadingSince: null }, now)).toBe(false);
  });
});
