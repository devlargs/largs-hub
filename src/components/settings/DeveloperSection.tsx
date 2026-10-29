import type { AppSettingsApi } from "./useAppSettings";
import { Section, SettingRow, Toggle } from "./controls";

const IS_MAC = window.electronAPI?.platform === "darwin";
const SHORTCUT = IS_MAC ? "Cmd+Option+I" : "Ctrl+Shift+I";

export default function DeveloperSection({ settings, toggle }: AppSettingsApi) {
  return (
    <Section title="Developer">
      <SettingRow
        label="Debug mode"
        info={`Lets you inspect any page. Press F12 or ${SHORTCUT} to open DevTools for whatever has focus (a service, or Largs Hub itself), or right-click a service and choose Inspect Element. DevTools close when the workspace locks and can't be opened until you unlock.`}
      >
        <Toggle checked={settings.debugMode} onChange={() => toggle("debugMode")} />
      </SettingRow>
    </Section>
  );
}
