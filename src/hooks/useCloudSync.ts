import { useEffect } from "react";
import { firebaseEnabled } from "../lib/firebaseEnv";

// Starts the cloud sync engine once for the app's lifetime. Firebase is loaded
// lazily, so the window shows without waiting for it, and a build without the
// config never loads it at all.
export function useCloudSync(): void {
  useEffect(() => {
    if (!firebaseEnabled || !window.electronAPI) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    import("../lib/cloud-sync")
      .then(({ startCloudSync }) => {
        if (!cancelled) stop = startCloudSync();
      })
      .catch((error) => console.error("[cloud] Failed to start sync:", error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
}
