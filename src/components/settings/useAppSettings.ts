import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../types";

const DEFAULT_SETTINGS: AppSettings = {
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
};

export type BooleanSettingKey = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

export interface AppSettingsApi {
  settings: AppSettings;
  // Store a value in main, then show it
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  toggle: (key: BooleanSettingKey) => Promise<void>;
  // Show a value without storing it: a slider mid-drag, or a value main has
  // already stored (the folder picker)
  preview: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

// The app settings, loaded from main, with helpers to change them.
export function useAppSettings(): AppSettingsApi {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getSettings().then(setSettings);
  }, []);

  const preview = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
      setSettings((s) => ({ ...s, [key]: value })),
    [],
  );

  const save = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      await window.electronAPI.updateSetting(key, value);
      preview(key, value);
    },
    [preview],
  );

  const toggle = (key: BooleanSettingKey) => save(key, !settings[key]);

  return { settings, save, toggle, preview };
}
