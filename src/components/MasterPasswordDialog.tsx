import { useCallback, useState } from "react";
import Modal from "./ui/Modal";
import PasswordInput from "./ui/PasswordInput";

// Sets the first master password, changes an existing one (issue #102), or
// confirms it before security controls are switched off (issue #111). Changing
// and switching off ask for the current password first — otherwise anyone who
// walks up to an unlocked window could lock the owner out of their own
// workspace, or simply turn the lock off.

interface MasterPasswordDialogProps {
  // "set" is the first-run prompt behind the Add Security Controls toggle;
  // "disable" switching that toggle off; "change" the Change Master Password
  // button.
  mode: "set" | "disable" | "change";
  onDone: () => void;
  onCancel: () => void;
}

export default function MasterPasswordDialog({
  mode,
  onDone,
  onCancel,
}: MasterPasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCancel = useCallback(() => {
    if (!saving) onCancel();
  }, [onCancel, saving]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const result =
      mode === "disable"
        ? await window.electronAPI.security.setEnabled(false, currentPassword)
        : await window.electronAPI.security.setPassword({
            ...(mode === "change" ? { currentPassword } : {}),
            password,
            confirm,
          });
    setSaving(false);
    if (result.ok) {
      onDone();
      return;
    }
    setError(result.error ?? "That didn't work.");
  };

  const title = {
    set: "Set a master password",
    disable: "Turn off security controls",
    change: "Change master password",
  }[mode];
  const description =
    mode === "disable"
      ? "Enter your master password to stop asking for it. It's kept, so switching this back on won't ask for a new one."
      : "It is asked for on every launch, and after the window has been left minimized for a while.";
  const needsCurrent = mode !== "set";

  return (
    <Modal label={title} onClose={handleCancel} width={400}>
      {(close) => (
        <>
          <h2
            className="font-semibold"
            style={{
              fontSize: "var(--text-lg)",
              color: "var(--text-primary)",
              marginBottom: "var(--space-2xs)",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginBottom: "var(--space-lg)",
            }}
          >
            {description}
          </p>

          <form onSubmit={submit} className="flex flex-col" style={{ gap: "var(--space-sm)" }}>
            {needsCurrent && (
              <Field
                id="current-password"
                label={mode === "disable" ? "Master password" : "Current password"}
                value={currentPassword}
                autoFocus
                autoComplete="current-password"
                onChange={setCurrentPassword}
              />
            )}
            {mode !== "disable" && (
              <>
                <Field
                  id="new-password"
                  label="Password"
                  value={password}
                  autoFocus={mode === "set"}
                  onChange={setPassword}
                />
                <Field
                  id="confirm-password"
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                />
              </>
            )}

            {/* Reserved height so the buttons don't jump when an error appears. */}
            <div
              role="alert"
              aria-live="polite"
              style={{
                minHeight: 16,
                fontSize: "var(--text-xs)",
                color: "var(--danger)",
                opacity: error ? 1 : 0,
                transition: "opacity var(--dur-short) var(--ease-out)",
              }}
            >
              {error || "\u00a0"}
            </div>

            <div className="flex justify-end" style={{ gap: "var(--space-xs)" }}>
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="rounded-lg text-sm font-medium cursor-pointer hover:brightness-110"
                style={{
                  padding: "8px 16px",
                  backgroundColor: "var(--sidebar-hover)",
                  color: "var(--text-primary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`rounded-lg text-sm font-semibold ${
                  saving ? "" : "cursor-pointer hover:brightness-110 active:translate-y-px"
                }`}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "var(--accent)",
                  color: "var(--surface)",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? "Saving\u2026" : mode === "disable" ? "Turn off" : "Submit"}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

function Field({
  id,
  label,
  value,
  autoFocus,
  autoComplete = "new-password",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoFocus?: boolean;
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-2xs)" }}>
      <label htmlFor={id} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <PasswordInput
        id={id}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg outline-none"
        style={{
          padding: "8px 12px",
          fontSize: "var(--text-md)",
          backgroundColor: "var(--surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      />
    </div>
  );
}
