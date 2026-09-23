import type { AppSettingsApi } from "./useAppSettings";
import { MinutesSelect, Section, SettingRow, Toggle } from "./controls";

// Where the tray icon lives: the notification area on Windows, the menu bar on macOS
const IS_MAC = window.electronAPI?.platform === "darwin";
const TRAY = IS_MAC ? "the menu bar" : "the notification area";

export default function GeneralSection({ settings, save, toggle }: AppSettingsApi) {
  return (
    <Section title="General">
      <SettingRow
        label="Launch at startup"
        info={`Opens Largs Hub by itself when you sign in to ${IS_MAC ? "your Mac" : "Windows"}, so your services are ready without starting it by hand.`}
      >
        <Toggle checked={settings.launchAtStartup} onChange={() => toggle("launchAtStartup")} />
      </SettingRow>

      <SettingRow
        label="Wake services automatically"
        info="Loads every enabled service in the background as soon as the app starts, so unread counts show up and each one is ready when you click it. Turned off, a service only loads the first time you open it."
      >
        <Toggle
          checked={settings.wakeServicesAutomatically}
          onChange={() => toggle("wakeServicesAutomatically")}
        />
      </SettingRow>

      <SettingRow
        label="Hibernate inactive services"
        info="Unloads a service you haven't looked at for this long, to free memory. It reloads the next time you click it, which can take a moment. Never keeps them all loaded."
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
        info={`Closing the window hides it to ${TRAY} instead of quitting, so unread counts and notifications keep coming. Quit from the tray icon's menu.`}
      >
        <Toggle checked={settings.closeToTray} onChange={() => toggle("closeToTray")} />
      </SettingRow>

      <SettingRow
        label="Minimize to tray"
        info={`Minimizing the window hides it to ${TRAY} instead of the ${IS_MAC ? "Dock" : "taskbar"}. Use the tray icon to bring it back.`}
      >
        <Toggle checked={settings.minimizeToTray} onChange={() => toggle("minimizeToTray")} />
      </SettingRow>
    </Section>
  );
}
