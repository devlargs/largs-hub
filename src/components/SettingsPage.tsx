import { useAppSettings } from "./settings/useAppSettings";
import GeneralSection from "./settings/GeneralSection";
import SecuritySection from "./settings/SecuritySection";
import PrivacySection from "./settings/PrivacySection";
import DownloadsSection from "./settings/DownloadsSection";
import UpdatesSection from "./settings/UpdatesSection";
import GitHubSection from "./settings/GitHubSection";

export default function SettingsPage() {
  const appSettings = useAppSettings();

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

        <GeneralSection {...appSettings} />
        <SecuritySection />
        <PrivacySection {...appSettings} />
        <DownloadsSection {...appSettings} />
        <UpdatesSection />
        <GitHubSection />
      </div>
    </div>
  );
}
