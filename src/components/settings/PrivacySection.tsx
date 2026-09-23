import type { AppSettings } from "../../types";
import type { AppSettingsApi } from "./useAppSettings";
import { Section, SettingRow, Slider } from "./controls";

type PrivacyKey = Extract<
  keyof AppSettings,
  "privacyCoverPercent" | "privacyOpacity" | "privacyHorizontalPercent" | "privacyHorizontalOpacity"
>;

const SLIDERS: Array<{ key: PrivacyKey; label: string; description: string }> = [
  {
    key: "privacyCoverPercent",
    label: "Vertical cover size",
    description: "How much of the page height is hidden from the top (0 = off)",
  },
  {
    key: "privacyOpacity",
    label: "Vertical cover opacity",
    description: "How solid the top cover is — lower values let the page show through",
  },
  {
    key: "privacyHorizontalPercent",
    label: "Horizontal cover size",
    description: "How much of the page width is hidden from the left (0 = off)",
  },
  {
    key: "privacyHorizontalOpacity",
    label: "Horizontal cover opacity",
    description: "How solid the left cover is — lower values let the page show through",
  },
];

export default function PrivacySection({ settings, preview }: AppSettingsApi) {
  return (
    <Section title="Privacy">
      {SLIDERS.map(({ key, label, description }) => (
        <SettingRow key={key} label={label} description={description}>
          {/* Sliders update local state on every drag frame but only persist on
              release, so the main process isn't re-injecting the overlay on
              each pixel of travel. */}
          <Slider
            value={settings[key]}
            onChange={(v) => preview(key, v)}
            onCommit={(v) => window.electronAPI.updateSetting(key, v)}
          />
        </SettingRow>
      ))}
    </Section>
  );
}
