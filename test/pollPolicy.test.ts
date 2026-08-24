import { describe, expect, it } from "vitest";
import {
  POLL_ACTIVE_MS,
  POLL_BACKGROUND_MS,
  PollConditions,
  pollIntervalChanged,
  pollIntervalMs,
} from "../electron/pollPolicy";

const conditions = (overrides: Partial<PollConditions> = {}): PollConditions => ({
  isActive: false,
  windowFocused: true,
  windowMinimized: false,
  systemSuspended: false,
  onBattery: false,
  ...overrides,
});

describe("pollIntervalMs", () => {
  it("polls fast for the active service in a focused window", () => {
    expect(pollIntervalMs(conditions({ isActive: true }))).toBe(POLL_ACTIVE_MS);
  });

  it("backs off for a background view", () => {
    expect(pollIntervalMs(conditions())).toBe(POLL_BACKGROUND_MS);
  });

  it("backs off the active view too once the window loses focus", () => {
    expect(pollIntervalMs(conditions({ isActive: true, windowFocused: false }))).toBe(
      POLL_BACKGROUND_MS,
    );
  });

  it("pauses entirely while minimized — nobody can see the badge change", () => {
    expect(pollIntervalMs(conditions({ isActive: true, windowMinimized: true }))).toBeNull();
    expect(pollIntervalMs(conditions({ windowMinimized: true }))).toBeNull();
  });

  it("pauses entirely while the machine is suspended", () => {
    expect(pollIntervalMs(conditions({ isActive: true, systemSuspended: true }))).toBeNull();
  });

  it("keeps the active view alive on battery, but pauses the rest", () => {
    expect(pollIntervalMs(conditions({ isActive: true, onBattery: true }))).toBe(POLL_ACTIVE_MS);
    expect(pollIntervalMs(conditions({ onBattery: true }))).toBeNull();
  });

  it("pauses the active view on battery once the window is unfocused", () => {
    expect(
      pollIntervalMs(conditions({ isActive: true, windowFocused: false, onBattery: true })),
    ).toBeNull();
  });

  it("lets suspend and minimize win over everything else", () => {
    const worst = conditions({
      isActive: true,
      windowFocused: true,
      systemSuspended: true,
      onBattery: false,
    });
    expect(pollIntervalMs(worst)).toBeNull();
  });

  it("never returns a rate faster than the old flat one", () => {
    const all: PollConditions[] = [];
    for (const isActive of [true, false])
      for (const windowFocused of [true, false])
        for (const windowMinimized of [true, false])
          for (const systemSuspended of [true, false])
            for (const onBattery of [true, false])
              all.push({ isActive, windowFocused, windowMinimized, systemSuspended, onBattery });
    for (const c of all) {
      const result = pollIntervalMs(c);
      if (result !== null) expect(result).toBeGreaterThanOrEqual(POLL_ACTIVE_MS);
    }
  });
});

describe("pollIntervalChanged", () => {
  it("detects a rate change", () => {
    expect(pollIntervalChanged(POLL_ACTIVE_MS, POLL_BACKGROUND_MS)).toBe(true);
    expect(pollIntervalChanged(POLL_ACTIVE_MS, null)).toBe(true);
    expect(pollIntervalChanged(null, POLL_BACKGROUND_MS)).toBe(true);
  });

  it("reports no change when the rate is the same, so the timer is left alone", () => {
    expect(pollIntervalChanged(POLL_ACTIVE_MS, POLL_ACTIVE_MS)).toBe(false);
    expect(pollIntervalChanged(null, null)).toBe(false);
  });
});
