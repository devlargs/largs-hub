import { create } from "zustand";
import { UpdateStatus } from "../lib/updateStatus";
import type { UpdateDownloadState } from "../types";

// The software-update flow shared by Settings → Updates and the lock screen.
// It lives in a store rather than component state because the download runs
// in main for as long as it takes: leaving Settings mid-download must not
// reset the row to "Check for updates" (and invite a second download).
interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  newVersion: string;
  percent: number;
  releaseUrl: string;
  check: () => void;
  install: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  currentVersion: "",
  newVersion: "",
  percent: 0,
  releaseUrl: "",
  check: () => {
    // A check mid-download would hide the progress; main is still downloading.
    if (get().status === "downloading" || get().status === "checking") return;
    set({ status: "checking" });
    window.electronAPI
      .checkForUpdates()
      .then((result) => {
        if (result.updateAvailable && result.version) {
          set({
            newVersion: result.version,
            releaseUrl: result.releaseUrl ?? "",
            status: result.canInstall ? "available" : "manual",
          });
        } else {
          set({ status: "latest" });
        }
      })
      .catch(() => set({ status: "error" }));
  },
  install: () => {
    if (get().status === "downloading") return;
    set({ status: "downloading", percent: 0 });
    // The download URL is resolved and verified in the main process
    window.electronAPI.downloadAndInstallUpdate().catch(() => set({ status: "error" }));
  },
}));

// Main's view of the download wins: if it is downloading, so is this row,
// whatever this page last thought (see UpdateDownloadState).
export function applyMainDownloadState(main: UpdateDownloadState) {
  if (!main.downloading) return;
  useUpdateStore.setState({
    status: "downloading",
    newVersion: main.version ?? useUpdateStore.getState().newVersion,
    percent: main.percent,
  });
}

// One app-wide subscription, so progress keeps arriving while no update UI is
// mounted. Started by the first component that shows the update row.
let started = false;
export function startUpdateTracking() {
  if (started || !window.electronAPI) return;
  started = true;
  window.electronAPI.getAppVersion().then((currentVersion) => {
    useUpdateStore.setState({ currentVersion });
  });
  window.electronAPI.getUpdateDownloadState().then(applyMainDownloadState);
  window.electronAPI.onUpdateDownloadProgress((info) => {
    useUpdateStore.setState({ percent: info.percent });
  });
}
