import { useCallback, useEffect } from "react";
import { startUpdateTracking, useUpdateStore } from "../store/update";

// The update row's state and actions, from the app-wide update store (see
// src/store/update.ts), so every place that shows it agrees and none of them
// loses a download in progress by unmounting.
export function useUpdateCheck() {
  const { status, currentVersion, newVersion, percent, releaseUrl, check, install } =
    useUpdateStore();

  useEffect(startUpdateTracking, []);

  const openReleasePage = useCallback(() => {
    if (releaseUrl) window.electronAPI.openLinkExternal(releaseUrl);
  }, [releaseUrl]);

  return { status, currentVersion, newVersion, percent, check, install, openReleasePage };
}
