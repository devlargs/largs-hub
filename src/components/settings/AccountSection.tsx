import { useEffect, useState } from "react";
import { useCloudStore } from "../../store/cloud";
import { syncStatusLabel } from "../../lib/cloudReconcile";
import AccountForm from "./AccountForm";
import { SecondaryButton, Section, SettingRow } from "./controls";

// Settings → Account: sign in to sync services and settings between
// computers (src/lib/cloudSync.ts). Optional; signed out, nothing changes.

export default function AccountSection() {
  const { status, email, deviceName, lastSyncedAt, error } = useCloudStore();
  const [busy, setBusy] = useState<"sync" | "sign-out" | null>(null);
  // Re-renders the "Last synced 2 min ago" line as time passes
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (status === "disabled") {
    return (
      <Section title="Account">
        <p className="text-sm py-2 @lg:px-3.5" style={{ color: "var(--text-muted)" }}>
          Cloud sync isn&apos;t set up in this build.
        </p>
      </Section>
    );
  }

  if (status === "signed-out" || (status === "signing-in" && !email)) {
    return (
      <Section title="Account">
        {status === "signing-in" ? (
          <p className="text-sm py-2 @lg:px-3.5" style={{ color: "var(--text-muted)" }}>
            Checking your account…
          </p>
        ) : (
          <AccountForm />
        )}
      </Section>
    );
  }

  const run = async (action: "sync" | "sign-out") => {
    if (busy) return;
    setBusy(action);
    try {
      const sync = await import("../../lib/cloud-sync");
      if (action === "sync") await sync.syncNow();
      else await sync.signOutOfCloud();
    } catch (err) {
      console.warn("[account] Action failed:", err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Account">
      <SettingRow
        label={email ?? "Signed in"}
        info="Your services and the settings that mean the same on any computer sync to this account. Window size, the download folder, Launch at startup, the master password, passcodes, custom icon images and scheduled automations stay on each computer. Web app logins (Gmail, Slack…) don't sync: sign in to each service again on a new computer."
        status={`This device: ${deviceName ?? "this computer"}`}
      >
        <SecondaryButton onClick={() => void run("sign-out")}>
          {busy === "sign-out" ? "Signing out…" : "Sign out"}
        </SecondaryButton>
      </SettingRow>
      <SettingRow
        label="Sync"
        info="Changes sync a couple of seconds after you make them. Only one computer can use the account at a time: signing in on another one pauses this one until you choose Use Largs Hub here."
        status={syncStatusLabel({ status, lastSyncedAt, error }, now)}
        statusColor={status === "error" ? "var(--danger)" : undefined}
      >
        <SecondaryButton onClick={() => void run("sync")}>
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </SecondaryButton>
      </SettingRow>
    </Section>
  );
}
