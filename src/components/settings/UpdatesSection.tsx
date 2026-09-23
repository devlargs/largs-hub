import { useEffect, useState } from "react";
import { UpdateStatus, updateDescription, updateStatusColor } from "../../lib/updateStatus";
import { SecondaryButton, Section, SettingRow } from "./controls";

export default function UpdatesSection() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getAppVersion().then(setCurrentVersion);
    return window.electronAPI.onUpdateDownloadProgress((info) => {
      setPercent(info.percent);
    });
  }, []);

  const handleCheck = () => {
    setStatus("checking");
    window.electronAPI
      .checkForUpdates()
      .then((result) => {
        if (result.updateAvailable && result.version) {
          setNewVersion(result.version);
          setStatus("available");
        } else {
          setStatus("latest");
        }
      })
      .catch(() => setStatus("error"));
  };

  const handleUpdate = () => {
    setStatus("downloading");
    setPercent(0);
    // The download URL is resolved and verified in the main process
    window.electronAPI.downloadAndInstallUpdate().catch(() => {
      setStatus("error");
    });
  };

  return (
    <Section title="Updates">
      <SettingRow
        label="Software update"
        description={updateDescription({ status, currentVersion, newVersion, percent })}
        statusColor={updateStatusColor(status)}
      >
        {status === "downloading" ? (
          <ProgressBar percent={percent} />
        ) : status === "checking" ? (
          <Spinner />
        ) : status === "available" ? (
          <button
            onClick={handleUpdate}
            className="rounded-lg text-sm font-semibold transition-opacity cursor-pointer hover:opacity-90"
            style={{
              padding: "6px 16px",
              backgroundColor: "var(--accent)",
              color: "var(--surface)",
            }}
          >
            Update Now
          </button>
        ) : (
          <SecondaryButton onClick={handleCheck}>Check for Updates</SecondaryButton>
        )}
      </SettingRow>
    </Section>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex w-[140px] items-center gap-3 @lg:w-auto @lg:min-w-[160px]">
      <div className="flex-1 rounded-full" style={{ height: 6, backgroundColor: "var(--border)" }}>
        <div
          className="rounded-full transition-all duration-300"
          style={{
            height: 6,
            width: `${percent}%`,
            backgroundColor: "var(--accent)",
          }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        {percent}%
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      style={{ width: 20, height: 20, color: "var(--accent)" }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="50 20"
        strokeLinecap="round"
      />
    </svg>
  );
}
