import { useState } from "react";
import PasswordInput from "../ui/PasswordInput";
import ConfirmDialog from "../ui/ConfirmDialog";
import type { UnlockResult } from "../../lib/cloud-sync";

// Settings → Passcodes while signed in but not unlocked on this computer: the
// account password unwraps the passcode key (lib/cloud-sync/passcodes.ts). The
// password lives in this component's state until then, and nowhere else.

const fieldStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "var(--text-md)",
  backgroundColor: "var(--sidebar)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export default function PasscodesUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canStartOver, setCanStartOver] = useState(false);
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);

  const run = async (
    action: (sync: typeof import("../../lib/cloud-sync")) => Promise<UnlockResult>,
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await action(await import("../../lib/cloud-sync"));
      if (result.ok) {
        setPassword("");
        setCanStartOver(false);
        onUnlocked();
      } else {
        setError(result.error);
        setCanStartOver(result.canStartOver === true);
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) void run((sync) => sync.unlockPasscodes(password));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" style={{ maxWidth: 380 }}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Your passcodes are saved in your account, encrypted with your account password so only you
        can read them. Enter it to use them on this computer.
      </p>
      <label htmlFor="passcodes-unlock" className="sr-only">
        Account password
      </label>
      <PasswordInput
        id="passcodes-unlock"
        value={password}
        autoComplete="current-password"
        placeholder="Account password"
        disabled={busy}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg outline-none"
        style={fieldStyle}
      />
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-lg text-sm font-semibold cursor-pointer hover:brightness-110 active:translate-y-px disabled:cursor-default disabled:opacity-60"
          style={{ padding: "7px 16px", backgroundColor: "var(--accent)", color: "var(--surface)" }}
        >
          {busy ? "Please wait…" : "Unlock passcodes"}
        </button>
        {canStartOver && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingStartOver(true)}
            className="text-xs cursor-pointer underline-offset-2 hover:underline disabled:cursor-default"
            style={{ color: "var(--text-secondary)" }}
          >
            Start over with no passcodes
          </button>
        )}
      </div>

      {confirmingStartOver && (
        <ConfirmDialog
          title="Start over?"
          body="The passcodes saved in your account were encrypted with your old password and can't be recovered. Starting over deletes them from your account and saves new ones under your current password."
          confirmLabel="Start over"
          tone="danger"
          onConfirm={() => void run((sync) => sync.startPasscodesOver(password))}
          onClose={() => setConfirmingStartOver(false)}
        />
      )}
    </form>
  );
}
