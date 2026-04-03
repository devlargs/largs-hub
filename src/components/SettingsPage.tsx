import { useEffect, useState } from "react";
import { AppSettings } from "../types";
import { IoFolderOpen, IoClose } from "react-icons/io5";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "latest" | "error";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    downloadFolder: "",
    wakeServicesAutomatically: true,
    launchAtStartup: false,
    openFolderOnFinish: true,
    openFileOnFinish: false,
    downloadAlertOnFinish: true,
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getSettings().then(setSettings);
    window.electronAPI.getAppVersion().then(setCurrentVersion);

    const unsub = window.electronAPI.onUpdateDownloadProgress((info) => {
      setPercent(info.percent);
    });
    return unsub;
  }, []);

  const handleCheckUpdate = () => {
    setUpdateStatus("checking");
    window.electronAPI
      .checkForUpdates()
      .then((result) => {
        if (result.updateAvailable && result.version) {
          setNewVersion(result.version);
          setDownloadUrl(result.downloadUrl || "");
          setUpdateStatus("available");
        } else {
          setUpdateStatus("latest");
        }
      })
      .catch(() => setUpdateStatus("error"));
  };

  const handleUpdate = () => {
    if (!downloadUrl) return;
    setUpdateStatus("downloading");
    setPercent(0);
    window.electronAPI.downloadAndInstallUpdate(downloadUrl).catch(() => {
      setUpdateStatus("error");
    });
  };

  const handleSelectFolder = async () => {
    const folder = await window.electronAPI.selectDownloadFolder();
    if (folder) {
      setSettings((s) => ({ ...s, downloadFolder: folder }));
    }
  };

  const handleClearFolder = async () => {
    await window.electronAPI.updateSetting("downloadFolder", "");
    setSettings((s) => ({ ...s, downloadFolder: "" }));
  };

  const handleToggleWake = async () => {
    const next = !settings.wakeServicesAutomatically;
    await window.electronAPI.updateSetting("wakeServicesAutomatically", next);
    setSettings((s) => ({ ...s, wakeServicesAutomatically: next }));
  };

  const handleToggleSetting = async (key: keyof AppSettings) => {
    const next = !settings[key];
    await window.electronAPI.updateSetting(key, next);
    setSettings((s) => ({ ...s, [key]: next }));
  };

  return (
    <div
      className="overflow-auto"
      style={{
        backgroundColor: "var(--surface)",
        width: "100%",
        height: "100%",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--text-primary)", marginBottom: 32 }}
        >
          Settings
        </h1>

        {/* General */}
        <Section title="General">
          <SettingRow
            label="Launch at startup"
            description="Open the app automatically when Windows starts"
          >
            <Toggle
              checked={settings.launchAtStartup}
              onChange={() => handleToggleSetting("launchAtStartup")}
            />
          </SettingRow>

          <SettingRow
            label="Wake services automatically"
            description="Load all enabled services when the app starts"
          >
            <Toggle
              checked={settings.wakeServicesAutomatically}
              onChange={handleToggleWake}
            />
          </SettingRow>
        </Section>

        {/* Downloads */}
        <Section title="Downloads">
          <SettingRow
            label="Download folder"
            description={settings.downloadFolder || "System default (save dialog)"}
          >
            <div className="flex items-center gap-2">
              {settings.downloadFolder && (
                <button
                  onClick={handleClearFolder}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-sidebar-hover"
                  style={{ color: "var(--text-muted)" }}
                  title="Reset to default"
                >
                  <IoClose size={16} />
                </button>
              )}
              <button
                onClick={handleSelectFolder}
                className="flex items-center gap-2 rounded-lg text-sm font-medium transition-colors cursor-pointer hover:opacity-90"
                style={{
                  padding: "6px 14px",
                  backgroundColor: "var(--sidebar-hover)",
                  color: "var(--text-primary)",
                }}
              >
                <IoFolderOpen size={14} />
                Browse
              </button>
            </div>
          </SettingRow>

          <SettingRow
            label="Open folder on finish"
            description="Show the file in its folder when a download completes"
          >
            <Toggle
              checked={settings.openFolderOnFinish}
              onChange={() => handleToggleSetting("openFolderOnFinish")}
            />
          </SettingRow>

          <SettingRow
            label="Open file on finish"
            description="Open the downloaded file automatically when complete"
          >
            <Toggle
              checked={settings.openFileOnFinish}
              onChange={() => handleToggleSetting("openFileOnFinish")}
            />
          </SettingRow>

          <SettingRow
            label="Download alert"
            description="Show a notification when a download finishes"
          >
            <Toggle
              checked={settings.downloadAlertOnFinish}
              onChange={() => handleToggleSetting("downloadAlertOnFinish")}
            />
          </SettingRow>
        </Section>

        {/* Updates */}
        <Section title="Updates">
          <SettingRow
            label="Software update"
            description={
              updateStatus === "idle"
                ? `v${currentVersion}`
                : updateStatus === "checking"
                  ? "Checking..."
                  : updateStatus === "latest"
                    ? `v${currentVersion} \u2014 Up to date`
                    : updateStatus === "available"
                      ? `v${currentVersion} \u2192 v${newVersion} available`
                      : updateStatus === "downloading"
                        ? `Downloading v${newVersion}... ${percent}%`
                        : "Unable to check for updates"
            }
            statusColor={
              updateStatus === "latest"
                ? "#a6e3a1"
                : updateStatus === "error"
                  ? "#f38ba8"
                  : updateStatus === "available"
                    ? "var(--accent)"
                    : undefined
            }
          >
            {updateStatus === "downloading" ? (
              <div className="flex items-center gap-3" style={{ minWidth: 160 }}>
                <div
                  className="flex-1 rounded-full"
                  style={{ height: 6, backgroundColor: "var(--border)" }}
                >
                  <div
                    className="rounded-full transition-all duration-300"
                    style={{
                      height: 6,
                      width: `${percent}%`,
                      backgroundColor: "var(--accent)",
                    }}
                  />
                </div>
                <span
                  className="text-xs tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {percent}%
                </span>
              </div>
            ) : updateStatus === "checking" ? (
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
            ) : updateStatus === "available" ? (
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
              <button
                onClick={handleCheckUpdate}
                className="rounded-lg text-sm font-medium transition-colors cursor-pointer hover:opacity-90"
                style={{
                  padding: "6px 14px",
                  backgroundColor: "var(--sidebar-hover)",
                  color: "var(--text-primary)",
                }}
              >
                Check for Updates
              </button>
            )}
          </SettingRow>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        className="text-xs font-semibold uppercase tracking-wider"
        style={{
          color: "var(--text-muted)",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
      </h2>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  statusColor,
  children,
}: {
  label: string;
  description: string;
  statusColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg"
      style={{ padding: "12px 14px" }}
    >
      <div style={{ marginRight: 16, minWidth: 0, flex: 1 }}>
        <div
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: statusColor || "var(--text-muted)", marginTop: 2 }}
        >
          {description}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="relative rounded-full transition-colors cursor-pointer"
      style={{
        width: 44,
        height: 24,
        backgroundColor: checked ? "var(--accent)" : "var(--border)",
      }}
    >
      <span
        className="absolute rounded-full bg-white transition-transform"
        style={{
          width: 18,
          height: 18,
          top: 3,
          left: 3,
          transform: checked ? "translateX(20px)" : "translateX(0)",
        }}
      />
    </button>
  );
}
