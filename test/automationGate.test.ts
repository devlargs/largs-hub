import { describe, expect, it } from "vitest";
import { createAutomationGate } from "../electron/automationGate";

function gate() {
  const calls: string[] = [];
  const g = createAutomationGate({
    restore: () => calls.push("restore"),
    suspend: () => calls.push("suspend"),
  });
  return { g, calls };
}

describe("automationGate", () => {
  it("starts at launch without an account", () => {
    const { g, calls } = gate();
    g.launched(false);
    expect(calls).toEqual(["restore"]);
    expect(g.isRunning()).toBe(true);
  });

  it("waits for the account to sync when signed in", () => {
    const { g, calls } = gate();
    g.launched(true);
    expect(calls).toEqual([]);
    g.synced();
    expect(calls).toEqual(["restore"]);
  });

  it("doesn't start before the window has loaded, even if already synced", () => {
    const { g, calls } = gate();
    g.synced();
    expect(calls).toEqual([]);
    g.launched(true);
    expect(calls).toEqual(["restore"]);
  });

  it("pauses while another computer has the session and resumes on taking it back", () => {
    const { g, calls } = gate();
    g.launched(false);
    g.remoteLocked();
    expect(g.isRunning()).toBe(false);
    g.remoteLocked();
    g.synced();
    expect(calls).toEqual(["restore", "suspend", "restore"]);
  });

  it("starts on sign-out", () => {
    const { g, calls } = gate();
    g.launched(true);
    g.signedOut();
    expect(calls).toEqual(["restore"]);
  });

  it("restarts from a replaced list only while running", () => {
    const { g, calls } = gate();
    g.launched(true);
    g.replaced();
    expect(calls).toEqual([]);
    g.synced();
    g.replaced();
    expect(calls).toEqual(["restore", "suspend", "restore"]);
  });

  it("never restores twice for a second window load", () => {
    const { g, calls } = gate();
    g.launched(false);
    g.launched(false);
    expect(calls).toEqual(["restore"]);
  });
});
