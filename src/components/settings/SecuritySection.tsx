import { useEffect, useState } from "react";
import type { SecurityState } from "../../types";
import MasterPasswordDialog from "../MasterPasswordDialog";
import { MinutesSelect, SecondaryButton, Section, SettingRow, Toggle } from "./controls";

export default function SecuritySection() {
  const [security, setSecurity] = useState<SecurityState>({
    enabled: false,
    hasPassword: false,
    lockDelayMinutes: 10,
    locked: false,
  });
  // Which master-password prompt is open, if any: "set" is the first-run prompt
  // behind the toggle, "disable" asks for the password before switching it
  // off, "change" is the Change Master Password button.
  const [passwordDialog, setPasswordDialog] = useState<"set" | "disable" | "change" | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.security.getState().then(setSecurity);
  }, []);

  // Switching the toggle on for the first time has to collect a password
  // before anything is stored. Switching it off asks for that password, so
  // nobody at an unlocked window can turn the lock off (issue #111). Switching
  // it back on is just the flag, because the credential survives switching it
  // off.
  const handleToggle = async () => {
    if (!security.enabled && !security.hasPassword) {
      setPasswordDialog("set");
      return;
    }
    if (security.enabled && security.hasPassword) {
      setPasswordDialog("disable");
      return;
    }
    setSecurity((await window.electronAPI.security.setEnabled(!security.enabled)).state);
  };

  const handleLockDelayChange = async (minutes: number) => {
    setSecurity(await window.electronAPI.security.setLockDelay(minutes));
  };

  return (
    <>
      <Section title="Security">
        <SettingRow
          label="Add Security Controls"
          info="Asks for a master password when the app starts, when you lock your computer, and after the window has been left minimized. It keeps people off your screen; it doesn't encrypt anything stored on this computer. Turning it off asks for the password."
        >
          <Toggle checked={security.enabled} onChange={handleToggle} />
        </SettingRow>

        {security.enabled && (
          <>
            <SettingRow
              label="Lock after"
              info="How long the window may stay minimized (or hidden to the tray) before the workspace locks and asks for the master password again."
            >
              <MinutesSelect
                value={security.lockDelayMinutes}
                onChange={handleLockDelayChange}
                options={[
                  [5, "After 5 min"],
                  [10, "After 10 min"],
                  [30, "After 30 min"],
                ]}
              />
            </SettingRow>

            <SettingRow
              label="Change Master Password"
              info="Replaces the master password. You'll need the current one. The password is stored as a salted hash, never as itself, so it can't be read back or recovered, only replaced here."
            >
              <SecondaryButton onClick={() => setPasswordDialog("change")}>Change</SecondaryButton>
            </SettingRow>
          </>
        )}
      </Section>

      {passwordDialog && (
        <MasterPasswordDialog
          mode={passwordDialog}
          onDone={async () => {
            setPasswordDialog(null);
            setSecurity(await window.electronAPI.security.getState());
          }}
          onCancel={() => setPasswordDialog(null)}
        />
      )}
    </>
  );
}
