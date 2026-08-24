import { describe, expect, it } from "vitest";
import { HibernationCandidate, shouldHibernate } from "../electron/hibernationPolicy";

const NOW = 1_700_000_000_000;
const CUTOFF = NOW - 30 * 60_000;

const candidate = (overrides: Partial<HibernationCandidate> = {}): HibernationCandidate => ({
  serviceId: "svc",
  lastActiveAt: CUTOFF - 60_000, // idle past the cutoff
  audible: false,
  hasAutomation: false,
  hasDownload: false,
  ...overrides,
});

describe("shouldHibernate", () => {
  it("hibernates an idle background view", () => {
    expect(shouldHibernate(candidate(), "other", CUTOFF)).toEqual({ hibernate: true });
  });

  it("never hibernates the active service", () => {
    expect(shouldHibernate(candidate(), "svc", CUTOFF)).toEqual({
      hibernate: false,
      reason: "active",
    });
  });

  it("leaves a view that hasn't been idle long enough", () => {
    expect(shouldHibernate(candidate({ lastActiveAt: CUTOFF + 1 }), "other", CUTOFF)).toEqual({
      hibernate: false,
      reason: "not-idle-yet",
    });
  });

  it("gives a brand new view a full interval", () => {
    expect(shouldHibernate(candidate({ lastActiveAt: undefined }), "other", CUTOFF)).toEqual({
      hibernate: false,
      reason: "no-timestamp",
    });
  });

  it("hibernates a view sitting exactly on the cutoff", () => {
    expect(shouldHibernate(candidate({ lastActiveAt: CUTOFF }), "other", CUTOFF).hibernate).toBe(
      true,
    );
  });

  // The heart of #76: automation runs in a background view by definition, which
  // is exactly the view the idle sweep was tearing down.
  it("spares a view with running automation", () => {
    expect(shouldHibernate(candidate({ hasAutomation: true }), "other", CUTOFF)).toEqual({
      hibernate: false,
      reason: "busy",
    });
  });

  it("spares a view that is playing audio", () => {
    expect(shouldHibernate(candidate({ audible: true }), "other", CUTOFF)).toEqual({
      hibernate: false,
      reason: "busy",
    });
  });

  it("spares a view with a download in flight", () => {
    expect(shouldHibernate(candidate({ hasDownload: true }), "other", CUTOFF)).toEqual({
      hibernate: false,
      reason: "busy",
    });
  });

  it("hibernates once the work that was blocking it finishes", () => {
    const busy = candidate({ hasAutomation: true, audible: true, hasDownload: true });
    expect(shouldHibernate(busy, "other", CUTOFF).hibernate).toBe(false);
    // Same view, same (unreset) timestamp, work done — eligible immediately.
    expect(
      shouldHibernate(
        { ...busy, hasAutomation: false, audible: false, hasDownload: false },
        "other",
        CUTOFF,
      ),
    ).toEqual({ hibernate: true });
  });

  it("reports active before anything else, even for a busy view", () => {
    expect(shouldHibernate(candidate({ audible: true }), "svc", CUTOFF).hibernate).toBe(false);
  });
});
