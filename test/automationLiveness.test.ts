import { describe, expect, it } from "vitest";
import {
  SERVICE_DISABLED,
  SERVICE_REMOVED,
  WAITING_FOR_VIEW,
  livenessFor,
} from "../electron/automationLiveness";

describe("livenessFor", () => {
  it("runs when the service is enabled and its view is up", () => {
    expect(livenessFor({ service: {}, viewPresent: true })).toEqual({ action: "run" });
    expect(livenessFor({ service: { enabled: true }, viewPresent: true })).toEqual({
      action: "run",
    });
  });

  // The regression this file exists for: a view can be absent for reasons that
  // have nothing to do with the task — hibernation, a rebuilt view, the view
  // map being dropped when the window closed — and the task used to be thrown
  // away every time (issue #97).
  it("waits, rather than stopping, when only the view is missing", () => {
    expect(livenessFor({ service: {}, viewPresent: false })).toEqual({
      action: "wait",
      reason: WAITING_FOR_VIEW,
    });
  });

  it("stops when the service has been removed from the store", () => {
    expect(livenessFor({ service: undefined, viewPresent: false })).toEqual({
      action: "stop",
      reason: SERVICE_REMOVED,
    });
  });

  // Removal wins even if a view is somehow still around mid-teardown.
  it("stops on a removed service whose view hasn't gone yet", () => {
    expect(livenessFor({ service: undefined, viewPresent: true })).toEqual({
      action: "stop",
      reason: SERVICE_REMOVED,
    });
  });

  // Disabling frees the view on purpose — it's a deliberate "stop using this
  // account", not a transient gap.
  it("stops when the service has been disabled", () => {
    expect(livenessFor({ service: { enabled: false }, viewPresent: false })).toEqual({
      action: "stop",
      reason: SERVICE_DISABLED,
    });
    expect(livenessFor({ service: { enabled: false }, viewPresent: true })).toEqual({
      action: "stop",
      reason: SERVICE_DISABLED,
    });
  });

  // A service with no `enabled` field is enabled, matching sanitizeService.
  it("treats a missing enabled flag as enabled", () => {
    expect(livenessFor({ service: {}, viewPresent: true }).action).toBe("run");
    expect(livenessFor({ service: { enabled: undefined }, viewPresent: true }).action).toBe("run");
  });

  it("only ever ends a task for a reason the user can see in the sidebar", () => {
    // Every "stop" is something the user did to the service itself; nothing
    // about the view's lifecycle can produce one.
    for (const viewPresent of [true, false]) {
      expect(livenessFor({ service: {}, viewPresent }).action).not.toBe("stop");
    }
  });
});
