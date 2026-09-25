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
        info="Where downloaded files are saved. With no folder chosen, each download asks where to save it. The × button goes back to asking."
        status={settings.downloadFolder || "System default (save dialog)"}
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
        info={`When a download finishes, opens its folder in ${window.electronAPI?.platform === "darwin" ? "Finder" : "File Explorer"} with the file selected.`}
      >
        <Toggle
          checked={settings.openFolderOnFinish}
          onChange={() => toggle("openFolderOnFinish")}
        />
      </SettingRow>

      <SettingRow
        label="Open file on finish"
        info={`When a download you clicked finishes, opens it with the app your computer uses for that kind of file. Only documents (PDF, Word, Excel, PowerPoint, text, CSV), images, audio and video open this way. Programs, scripts, installers, archives and anything else are shown in ${window.electronAPI?.platform === "darwin" ? "Finder" : "File Explorer"} instead, for you to open yourself.`}
      >
        <Toggle checked={settings.openFileOnFinish} onChange={() => toggle("openFileOnFinish")} />
      </SettingRow>

      <SettingRow
        label="Download alert"
        info={`Shows a small alert with the file's name in the corner of the window when a download finishes. Its ${window.electronAPI?.platform === "darwin" ? "Show in Finder" : "Open file location"} link shows the file in its folder.`}
      >
        <Toggle
          checked={settings.downloadAlertOnFinish}
          onChange={() => toggle("downloadAlertOnFinish")}
        />
      </SettingRow>
    </Section>
  );
}
