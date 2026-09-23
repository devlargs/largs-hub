import { IoClose, IoFolderOpen } from "react-icons/io5";
import type { AppSettingsApi } from "./useAppSettings";
import { SecondaryButton, Section, SettingRow, Toggle } from "./controls";

export default function DownloadsSection({ settings, save, toggle, preview }: AppSettingsApi) {
  // Main stores the folder the user picked in its own dialog; only show it here
  const handleSelectFolder = async () => {
    const folder = await window.electronAPI.selectDownloadFolder();
    if (folder) preview("downloadFolder", folder);
  };

  return (
    <Section title="Downloads">
      <SettingRow
        label="Download folder"
        description={settings.downloadFolder || "System default (save dialog)"}
      >
        <div className="flex items-center gap-2">
          {settings.downloadFolder && (
            <button
              onClick={() => save("downloadFolder", "")}
              aria-label="Reset download folder to default"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-sidebar-hover"
              style={{ color: "var(--text-muted)" }}
              title="Reset to default"
            >
              <IoClose size={16} />
            </button>
          )}
          <SecondaryButton onClick={handleSelectFolder} className="flex items-center gap-2">
            <IoFolderOpen size={14} />
            Browse
          </SecondaryButton>
        </div>
      </SettingRow>

      <SettingRow
        label="Open folder on finish"
        description="Show the file in its folder when a download completes"
      >
        <Toggle
          checked={settings.openFolderOnFinish}
          onChange={() => toggle("openFolderOnFinish")}
        />
      </SettingRow>

      <SettingRow
        label="Open file on finish"
        description="Open the downloaded file automatically when complete"
      >
        <Toggle checked={settings.openFileOnFinish} onChange={() => toggle("openFileOnFinish")} />
      </SettingRow>

      <SettingRow label="Download alert" description="Show a notification when a download finishes">
        <Toggle
          checked={settings.downloadAlertOnFinish}
          onChange={() => toggle("downloadAlertOnFinish")}
        />
      </SettingRow>
    </Section>
  );
}
