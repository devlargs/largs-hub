import { useEffect, useState } from "react";

type UpdateStatus = "checking" | "available" | "downloading" | "latest" | "error";

export default function UpdatePage() {
  const [status, setStatus] = useState<UpdateStatus>("checking");
  const [currentVersion, setCurrentVersion] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getAppVersion().then(setCurrentVersion);

    window.electronAPI.checkForUpdates().then((result) => {
      if (result.updateAvailable && result.version) {
        setNewVersion(result.version);
        setDownloadUrl(result.downloadUrl || "");
        setStatus("available");
      } else {
        setStatus("latest");
      }
    }).catch(() => setStatus("error"));

    const unsub = window.electronAPI.onUpdateDownloadProgress((info) => {
      setPercent(info.percent);
    });

    return unsub;
  }, []);

  const handleUpdate = () => {
    if (!downloadUrl) return;
    setStatus("downloading");
    setPercent(0);
    window.electronAPI.downloadAndInstallUpdate(downloadUrl).catch(() => {
      setStatus("error");
    });
  };

  return (
    <div className="flex items-center justify-center" style={{ backgroundColor: "var(--surface)", width: "100%", height: "100%" }}>
      <div
        className="flex flex-col items-center text-center"
        style={{ maxWidth: 400, padding: 40 }}
      >
        {/* Checking */}
        {status === "checking" && (
          <>
            <svg
              className="animate-spin"
              style={{ width: 48, height: 48, color: "var(--accent)", marginBottom: 24 }}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50 20" strokeLinecap="round" />
            </svg>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", marginBottom: 8 }}>
              Checking for updates...
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Current version: v{currentVersion}
            </p>
          </>
        )}

        {/* Update available */}
        {status === "available" && (
          <>
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)", marginBottom: 24 }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", marginBottom: 8 }}>
              Update Available
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)", marginBottom: 24 }}>
              A new version <span className="font-semibold" style={{ color: "var(--accent)" }}>v{newVersion}</span> is available.
              You are currently on v{currentVersion}.
            </p>
            <button
              onClick={handleUpdate}
              className="text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 rounded-lg"
              style={{
                padding: "10px 28px",
                backgroundColor: "var(--accent)",
                color: "var(--surface)",
                border: "none",
              }}
            >
              Update Now
            </button>
          </>
        )}

        {/* Downloading */}
        {status === "downloading" && (
          <>
            <svg
              className="animate-spin"
              style={{ width: 48, height: 48, color: "var(--accent)", marginBottom: 24 }}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50 20" strokeLinecap="round" />
            </svg>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", marginBottom: 8 }}>
              Updating to v{newVersion}...
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)", marginBottom: 16 }}>
              Downloading and installing — the app will restart automatically.
            </p>
            <div className="w-full rounded-full" style={{ height: 6, backgroundColor: "var(--border)" }}>
              <div
                className="rounded-full transition-all duration-300"
                style={{ height: 6, width: `${percent}%`, backgroundColor: "var(--accent)" }}
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)", marginTop: 8 }}>
              {percent}%
            </p>
          </>
        )}

        {/* Already on latest */}
        {status === "latest" && (
          <>
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: "rgba(166,227,161,0.15)", marginBottom: 24 }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a6e3a1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", marginBottom: 8 }}>
              You're up to date!
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Largs Hub v{currentVersion} is the latest version.
            </p>
          </>
        )}

        {/* Error */}
        {status === "error" && (
          <>
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: "rgba(243,139,168,0.15)", marginBottom: 24 }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f38ba8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", marginBottom: 8 }}>
              Unable to check for updates
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Please check your internet connection and try again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
