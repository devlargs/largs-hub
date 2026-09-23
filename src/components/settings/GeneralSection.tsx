import type { AppSettingsApi } from "./useAppSettings";
import { MinutesSelect, Section, SettingRow, Toggle } from "./controls";

export default function GeneralSection({ settings, save, toggle }: AppSettingsApi) {
  return (
    <Section title="General">
      <SettingRow
        label="Launch at startup"
        description="Open the app automatically when Windows starts"
      >
        <Toggle checked={settings.launchAtStartup} onChange={() => toggle("launchAtStartup")} />
      </SettingRow>

      <SettingRow
        label="Wake services automatically"
        description="Load all enabled services when the app starts"
      >
        <Toggle
          checked={settings.wakeServicesAutomatically}
          onChange={() => toggle("wakeServicesAutomatically")}
        />
      </SettingRow>

      <SettingRow
        label="Hibernate inactive services"
        description="Unload services left idle to free memory; they reload on next click"
      >
        <MinutesSelect
          value={settings.hibernateInactiveMinutes}
          onChange={(minutes) => save("hibernateInactiveMinutes", minutes)}
          options={[
            [0, "Never"],
            [15, "After 15 min"],
            [30, "After 30 min"],
            [60, "After 1 hour"],
          ]}
        />
      </SettingRow>

      <SettingRow
        label="Close to tray"
        description="Keep running in the notification area when the window is closed, so badges and notifications carry on"
      >
        <Toggle checked={settings.closeToTray} onChange={() => toggle("closeToTray")} />
      </SettingRow>

      <SettingRow
        label="Minimize to tray"
        description="Hide to the notification area when the window is minimized"
      >
        <Toggle checked={settings.minimizeToTray} onChange={() => toggle("minimizeToTray")} />
      </SettingRow>
    </Section>
  );
}
