import { useCallback, useState } from "react";
import type { Passcode, PasscodesResult, Service } from "../../types";
import Modal from "../ui/Modal";
import PasswordInput from "../ui/PasswordInput";
import { ALL_SERVICES_LABEL, buildPasscodeDraft } from "../../lib/passcodes";

// Adds a passcode, or edits one. When editing, the saved passcode is never
// shown (it doesn't leave the main process): the field starts empty, and
// leaving it empty keeps what's saved.

const fieldStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "var(--text-md)",
  backgroundColor: "var(--surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export default function PasscodeDialog({
  passcode,
  services,
  onSaved,
  onCancel,
}: {
  // null to add a new one
  passcode: Passcode | null;
  services: Service[];
  onSaved: (result: PasscodesResult) => void;
  onCancel: () => void;
}) {
  const editing = passcode !== null;
  const [label, setLabel] = useState(passcode?.label ?? "");
  const [username, setUsername] = useState(passcode?.username ?? "");
  const [serviceId, setServiceId] = useState(passcode?.serviceId ?? "");
  const [secret, setSecret] = useState("");
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
    const result = await window.electronAPI.passcodes.save(
      buildPasscodeDraft({ id: passcode?.id, label, username, serviceId, secret }),
    );
    setSaving(false);
    if (result.ok) onSaved(result);
    else setError(result.error ?? "That didn't work.");
  };

  const title = editing ? "Edit passcode" : "Save a passcode";

  return (
    <Modal label={title} onClose={handleCancel} width={420}>
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
            Right-click a field in a service and choose Fill passcode to type it in.
          </p>

          <form onSubmit={submit} className="flex flex-col" style={{ gap: "var(--space-sm)" }}>
            <Field id="passcode-label" label="Name">
              <input
                id="passcode-label"
                value={label}
                autoFocus
                maxLength={80}
                placeholder="Messenger PIN"
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-lg outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field id="passcode-username" label="Username (optional)">
              <input
                id="passcode-username"
                value={username}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field id="passcode-secret" label="Passcode">
              <PasswordInput
                id="passcode-secret"
                value={secret}
                maxLength={1000}
                autoComplete="new-password"
                placeholder={editing ? "Leave empty to keep the saved one" : undefined}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-lg outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field id="passcode-service" label="Offer it in">
              <select
                id="passcode-service"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-lg cursor-pointer outline-none"
                style={fieldStyle}
              >
                <option value="">{ALL_SERVICES_LABEL}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

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
              {error || " "}
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
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-2xs)" }}>
      <label htmlFor={id} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
