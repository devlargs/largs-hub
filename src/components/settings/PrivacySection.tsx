import type { AppSettings } from "../../types";
import type { AppSettingsApi } from "./useAppSettings";
import { Section, SettingRow, Slider } from "./controls";

type PrivacyKey = Extract<
  keyof AppSettings,
  "privacyCoverPercent" | "privacyOpacity" | "privacyHorizontalPercent" | "privacyHorizontalOpacity"
>;

const SLIDERS: Array<{ key: PrivacyKey; label: string; info: string }> = [
  {
    key: "privacyCoverPercent",
    label: "Vertical cover size",
    info: "Privacy mode covers the top of the page. This is how much of its height the cover takes, from the top. 0 turns this cover off.",
  },
  {
    key: "privacyOpacity",
    label: "Vertical cover opacity",
    info: "How solid the top cover is. Lower values let the page show through faintly; 100 hides it completely.",
  },
  {
    key: "privacyHorizontalPercent",
    label: "Horizontal cover size",
    info: "A second cover over the left side of the page. This is how much of its width the cover takes, from the left. 0 turns this cover off.",
  },
  {
    key: "privacyHorizontalOpacity",
    label: "Horizontal cover opacity",
    info: "How solid the left cover is. Lower values let the page show through faintly; 100 hides it completely.",
  },
];

export default function PrivacySection({ settings, preview }: AppSettingsApi) {
  return (
    <Section title="Privacy">
      {SLIDERS.map(({ key, label, info }) => (
        <SettingRow key={key} label={label} info={info}>
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
