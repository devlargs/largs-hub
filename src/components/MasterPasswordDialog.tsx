import { useCallback, useState } from "react";
import Modal from "./ui/Modal";

// Sets the first master password, or changes an existing one (issue #102).
// Changing asks for the current password first — otherwise anyone who walks up
// to an unlocked window can lock the owner out of their own workspace.

interface MasterPasswordDialogProps {
  // "set" is the first-run prompt behind the Add Security Controls toggle;
  // "change" is the Change Master Password button.
  mode: "set" | "change";
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
    const result = await window.electronAPI.security.setPassword({
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

  const title = mode === "change" ? "Change master password" : "Set a master password";

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
            It is asked for on every launch, and after the window has been left minimized for a
            while.
          </p>

          <form onSubmit={submit} className="flex flex-col" style={{ gap: "var(--space-sm)" }}>
            {mode === "change" && (
              <Field
                id="current-password"
                label="Current password"
                value={currentPassword}
                autoFocus
                onChange={setCurrentPassword}
              />
            )}
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
                {saving ? "Saving\u2026" : "Submit"}
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
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-2xs)" }}>
      <label htmlFor={id} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        autoFocus={autoFocus}
        autoComplete="new-password"
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
