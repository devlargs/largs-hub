import { useCallback, useEffect, useState } from "react";
import { UpdateStatus } from "../lib/updateStatus";

// The software-update flow shared by Settings → Updates and the lock screen:
// check GitHub, then install (or offer the release page when there's no
// checksum). What gets downloaded is decided in main; this only tracks state.
export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [percent, setPercent] = useState(0);
  const [releaseUrl, setReleaseUrl] = useState("");

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getAppVersion().then(setCurrentVersion);
    return window.electronAPI.onUpdateDownloadProgress((info) => {
      setPercent(info.percent);
    });
  }, []);

  const check = useCallback(() => {
    setStatus("checking");
    window.electronAPI
      .checkForUpdates()
      .then((result) => {
        if (result.updateAvailable && result.version) {
          setNewVersion(result.version);
          setReleaseUrl(result.releaseUrl ?? "");
          setStatus(result.canInstall ? "available" : "manual");
        } else {
          setStatus("latest");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  const install = useCallback(() => {
    setStatus("downloading");
    setPercent(0);
    // The download URL is resolved and verified in the main process
    window.electronAPI.downloadAndInstallUpdate().catch(() => {
      setStatus("error");
    });
  }, []);

  const openReleasePage = useCallback(() => {
    if (releaseUrl) window.electronAPI.openLinkExternal(releaseUrl);
  }, [releaseUrl]);

  return { status, currentVersion, newVersion, percent, check, install, openReleasePage };
}
