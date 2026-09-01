import React, { useEffect, useState } from "react";
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
    hibernateInactiveMinutes: 0,
    closeToTray: false,
    minimizeToTray: false,
    privacyCoverPercent: 50,
    privacyOpacity: 100,
    privacyHorizontalPercent: 0,
    privacyHorizontalOpacity: 100,
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [currentVersion, setCurrentVersion] = useState("");
  const [newVersion, setNewVersion] = useState("");
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
          setUpdateStatus("available");
        } else {
          setUpdateStatus("latest");
        }
      })
      .catch(() => setUpdateStatus("error"));
  };

  const handleUpdate = () => {
    setUpdateStatus("downloading");
    setPercent(0);
    // The download URL is resolved and verified in the main process
    window.electronAPI.downloadAndInstallUpdate().catch(() => {
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

  // Sliders update local state on every drag frame but only persist on release,
  // so the main process isn't re-injecting the overlay on each pixel of travel.
  type PrivacyKey =
    | "privacyCoverPercent"
    | "privacyOpacity"
    | "privacyHorizontalPercent"
    | "privacyHorizontalOpacity";

  const handlePrivacyChange = (key: PrivacyKey, value: number) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const handlePrivacyCommit = async (key: PrivacyKey, value: number) => {
    await window.electronAPI.updateSetting(key, value);
  };

  const handleTrayToggle = async (key: "closeToTray" | "minimizeToTray") => {
    const next = !settings[key];
    await window.electronAPI.updateSetting(key, next);
    setSettings((s) => ({ ...s, [key]: next }));
  };

  const handleHibernateChange = async (minutes: number) => {
    await window.electronAPI.updateSetting("hibernateInactiveMinutes", minutes);
    setSettings((s) => ({ ...s, hibernateInactiveMinutes: minutes }));
  };

  return (
    // @container so the layout below responds to the width of the settings pane
    // itself (the window minus the sidebar), not the whole viewport.
    <div
      className="@container overflow-auto"
      style={{
        backgroundColor: "var(--surface)",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        className="px-5 pt-6 pb-10 @lg:px-8 @lg:pt-8 @lg:pb-12"
        style={{ maxWidth: 720, margin: "0 auto" }}
      >
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
            <Toggle checked={settings.wakeServicesAutomatically} onChange={handleToggleWake} />
          </SettingRow>

          <SettingRow
            label="Hibernate inactive services"
            description="Unload services left idle to free memory; they reload on next click"
          >
            <select
              value={settings.hibernateInactiveMinutes}
              onChange={(e) => handleHibernateChange(Number(e.target.value))}
              className="text-sm rounded-lg cursor-pointer outline-none"
              style={{
                padding: "6px 10px",
                backgroundColor: "var(--sidebar-hover)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              <option value={0}>Never</option>
              <option value={15}>After 15 min</option>
              <option value={30}>After 30 min</option>
              <option value={60}>After 1 hour</option>
            </select>
          </SettingRow>

          <SettingRow
            label="Close to tray"
            description="Keep running in the notification area when the window is closed, so badges and notifications carry on"
          >
            <Toggle
              checked={settings.closeToTray}
              onChange={() => handleTrayToggle("closeToTray")}
            />
          </SettingRow>

          <SettingRow
            label="Minimize to tray"
            description="Hide to the notification area when the window is minimized"
          >
            <Toggle
              checked={settings.minimizeToTray}
              onChange={() => handleTrayToggle("minimizeToTray")}
            />
          </SettingRow>
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <SettingRow
            label="Vertical cover size"
            description="How much of the page height is hidden from the top (0 = off)"
          >
            <Slider
              value={settings.privacyCoverPercent}
              onChange={(v) => handlePrivacyChange("privacyCoverPercent", v)}
              onCommit={(v) => handlePrivacyCommit("privacyCoverPercent", v)}
            />
          </SettingRow>

          <SettingRow
            label="Vertical cover opacity"
            description="How solid the top cover is — lower values let the page show through"
          >
            <Slider
              value={settings.privacyOpacity}
              onChange={(v) => handlePrivacyChange("privacyOpacity", v)}
              onCommit={(v) => handlePrivacyCommit("privacyOpacity", v)}
            />
          </SettingRow>

          <SettingRow
            label="Horizontal cover size"
            description="How much of the page width is hidden from the left (0 = off)"
          >
            <Slider
              value={settings.privacyHorizontalPercent}
              onChange={(v) => handlePrivacyChange("privacyHorizontalPercent", v)}
              onCommit={(v) => handlePrivacyCommit("privacyHorizontalPercent", v)}
            />
          </SettingRow>

          <SettingRow
            label="Horizontal cover opacity"
            description="How solid the left cover is — lower values let the page show through"
          >
            <Slider
              value={settings.privacyHorizontalOpacity}
              onChange={(v) => handlePrivacyChange("privacyHorizontalOpacity", v)}
              onCommit={(v) => handlePrivacyCommit("privacyHorizontalOpacity", v)}
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
                  aria-label="Reset download folder to default"
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
              <div className="flex w-[140px] items-center gap-3 @lg:w-auto @lg:min-w-[160px]">
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
                <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
      <div className="flex flex-col gap-1">{children}</div>
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
    // Label left, control right, on one line at every width — a control that
    // stacks under its own label reads as a separate thing from the setting it
    // belongs to (issue #98). The label column takes the slack and the control
    // keeps its intrinsic size, so the two stay on the same optical line
    // however the description wraps.
    <div className="flex flex-row items-center justify-between gap-3 rounded-lg py-2 @lg:gap-6 @lg:px-3.5 @lg:py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        <div
          className="text-xs break-words @lg:truncate"
          style={{ color: statusColor || "var(--text-muted)", marginTop: 2 }}
        >
          {description}
        </div>
      </div>
      <div className="flex shrink-0 justify-end">
        {/* The row's label is the control's accessible name; a bare Toggle has
            no text of its own. */}
        {React.isValidElement(children) && children.type === Toggle
          ? React.cloneElement(children as React.ReactElement<{ label?: string }>, { label })
          : children}
      </div>
    </div>
  );
}

function Slider({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="flex w-[140px] items-center gap-3 @lg:w-auto @lg:min-w-[180px]">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: "var(--accent)" }}
      />
      <span
        className="text-xs tabular-nums text-right"
        style={{ color: "var(--text-muted)", width: 34 }}
      >
        {value}%
      </span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  // Supplied by SettingRow: the switch is graphical, so without this a screen
  // reader announces an unnamed control (issue #88).
  label?: string;
}) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
