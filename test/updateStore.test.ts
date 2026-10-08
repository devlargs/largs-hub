import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateStore } from "../src/store/update";

const api = {
  checkForUpdates: vi.fn(),
  downloadAndInstallUpdate: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { electronAPI: api });
  useUpdateStore.setState({ status: "idle", newVersion: "", percent: 0, releaseUrl: "" });
});

describe("update store", () => {
  it("asks main to download only once, however many times Update now is pressed", () => {
    api.downloadAndInstallUpdate.mockReturnValue(new Promise(() => {}));
    useUpdateStore.setState({ status: "available", newVersion: "0.1.80" });

    useUpdateStore.getState().install();
    useUpdateStore.getState().install();

    expect(api.downloadAndInstallUpdate).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().status).toBe("downloading");
  });

  it("doesn't re-check while downloading, so the progress stays", () => {
    useUpdateStore.setState({ status: "downloading", percent: 40 });

    useUpdateStore.getState().check();

    expect(api.checkForUpdates).not.toHaveBeenCalled();
    expect(useUpdateStore.getState()).toMatchObject({ status: "downloading", percent: 40 });
  });

  it("offers the install after a check finds a verifiable update", async () => {
    api.checkForUpdates.mockResolvedValue({
      updateAvailable: true,
      version: "0.1.80",
      canInstall: true,
      releaseUrl: "https://github.com/devlargs/largs-hub/releases/tag/v0.1.80",
    });

    useUpdateStore.getState().check();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe("available"));
    expect(useUpdateStore.getState().newVersion).toBe("0.1.80");
  });

  it("shows an error when the download fails, so it can be retried", async () => {
    api.downloadAndInstallUpdate.mockRejectedValue(new Error("network"));
    useUpdateStore.setState({ status: "available" });

    useUpdateStore.getState().install();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe("error"));
  });
});
