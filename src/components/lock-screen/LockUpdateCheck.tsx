import { useUpdateCheck } from "../../hooks/useUpdateCheck";
import { updateDescription, updateStatusColor } from "../../lib/updateStatus";

// "Check for updates" at the foot of the lock screen, so a locked workspace
// can still be updated without the password. Installing closes and reopens
// the app, which comes back locked, so nothing is reachable past the lock.
export default function LockUpdateCheck() {
  const { status, currentVersion, newVersion, percent, check, install, openReleasePage } =
    useUpdateCheck();

  const action =
    status === "available"
      ? { label: "Update now", onClick: install }
      : status === "manual"
        ? { label: "Download", onClick: openReleasePage }
        : status === "checking" || status === "downloading"
          ? null
          : { label: status === "idle" ? "Check for updates" : "Check again", onClick: check };

  return (
    <div
      className="absolute inset-x-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6"
      style={{ bottom: "var(--space-lg)", fontSize: "var(--text-xs)" }}
      aria-live="polite"
    >
      <span
        className="tabular-nums"
        style={{ color: updateStatusColor(status) ?? "var(--text-muted)" }}
      >
        {updateDescription({ status, currentVersion, newVersion, percent })}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="cursor-pointer rounded-md font-semibold hover:brightness-110"
          style={{
            padding: "4px 10px",
            color: status === "available" ? "var(--surface)" : "var(--text-primary)",
            backgroundColor: status === "available" ? "var(--accent)" : "var(--sidebar)",
            border: "1px solid var(--border)",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
