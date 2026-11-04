import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));

import { setAutomationDeps, type AutomationDeps } from "../electron/messengerAutomation/runtime";
import { createTask, handleMissingView } from "../electron/messengerAutomation/lifecycle";

// A task that finds no view (behind the workspace lock, or after a launch that
// didn't wake services) loads the view in the background instead of waiting
// for someone to open the service.

function depsWith(services: Array<{ id: string; url: string; enabled?: boolean }>) {
  const wakeServiceView = vi.fn();
  const deps = {
    getServiceView: () => undefined,
    getServices: () => services,
    getUiView: () => null,
    savePersistedTasks: () => undefined,
    savePersistedAutoStops: () => undefined,
    onTasksChanged: () => undefined,
    closeCallWindow: () => undefined,
    setCallAudioMuted: () => undefined,
    wakeServiceView,
  } as unknown as AutomationDeps;
  setAutomationDeps(deps);
  return wakeServiceView;
}

const spec = { type: "startCallCycle", fromSec: 5, toSec: 10, ringSeconds: 20 } as const;

describe("handleMissingView", () => {
  it("wakes the service's view and keeps the task", () => {
    const wake = depsWith([{ id: "s1", url: "https://web.whatsapp.com" }]);
    const task = createTask("s1", spec);
    expect(handleMissingView(task.id, "s1")).toBe(false);
    expect(wake).toHaveBeenCalledWith("s1");
  });

  it("doesn't wake a disabled service, it ends the task", () => {
    const wake = depsWith([{ id: "s2", url: "https://web.whatsapp.com", enabled: false }]);
    const task = createTask("s2", spec);
    expect(handleMissingView(task.id, "s2")).toBe(true);
    expect(wake).not.toHaveBeenCalled();
  });
});
