import { useUpdateCheck } from "../../hooks/useUpdateCheck";
import { updateDescription, updateStatusColor } from "../../lib/updateStatus";
import { SecondaryButton, Section, SettingRow } from "./controls";

export default function UpdatesSection() {
  const { status, currentVersion, newVersion, percent, check, install, openReleasePage } =
    useUpdateCheck();

  return (
    <Section title="Updates">
      <SettingRow
        label="Software update"
        info="Checks GitHub for a newer version of Largs Hub. Update Now downloads it, checks it against the checksum GitHub publishes, then closes the app to install it and reopens on the new version. If GitHub has no checksum for it, the update can't be checked, so it isn't installed: Download opens its GitHub page instead."
        status={updateDescription({ status, currentVersion, newVersion, percent })}
        statusColor={updateStatusColor(status)}
      >
        {status === "downloading" ? (
          <ProgressBar percent={percent} />
        ) : status === "checking" ? (
          <Spinner />
        ) : status === "manual" ? (
          <SecondaryButton onClick={openReleasePage}>Download</SecondaryButton>
        ) : status === "available" ? (
          <button
            onClick={install}
            className="rounded-lg text-sm font-semibold transition-opacity cursor-pointer hover:opacity-90"
            style={{
              padding: "6px 16px",
              backgroundColor: "var(--accent)",
              color: "var(--surface)",
            }}
          >
            Update Now
          </button>
        ) : (
          <SecondaryButton onClick={check}>Check for Updates</SecondaryButton>
        )}
      </SettingRow>
    </Section>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex w-[140px] items-center gap-3 @lg:w-auto @lg:min-w-[160px]">
      <div className="flex-1 rounded-full" style={{ height: 6, backgroundColor: "var(--border)" }}>
        <div
          className="rounded-full transition-all duration-300"
          style={{
            height: 6,
            width: `${percent}%`,
            backgroundColor: "var(--accent)",
          }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        {percent}%
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      style={{ width: 20, height: 20, color: "var(--accent)" }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="50 20"
        strokeLinecap="round"
      />
    </svg>
  );
}
