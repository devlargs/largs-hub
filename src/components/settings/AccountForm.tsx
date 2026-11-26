import { useState } from "react";
import PasswordInput from "../ui/PasswordInput";

// Settings → Account while signed out: sign in, create an account, or ask for
// a password reset email. The password lives in this component's state until
// it's handed to Firebase (cloudAuth.ts), and nowhere else.

type Mode = "sign-in" | "sign-up" | "reset";

const fieldStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "var(--text-md)",
  backgroundColor: "var(--sidebar)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

const linkClass =
  "text-xs cursor-pointer underline-offset-2 hover:underline disabled:cursor-default";

export default function AccountForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const switchTo = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const auth = await import("../../lib/cloudAuth");
      if (mode === "reset") {
        const result = await auth.sendReset(email);
        if (result.ok) setNotice(result.message ?? "");
        else setError(result.error);
        return;
      }
      const result =
        mode === "sign-up"
          ? await auth.signUp(email, password, confirm)
          : await auth.signIn(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Signed in: the section swaps to the signed-in view on its own.
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    mode === "reset" ? "Send reset link" : mode === "sign-up" ? "Create account" : "Sign in";

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 py-2 @lg:px-3.5"
      style={{ maxWidth: 380 }}
    >
      <p className="text-sm" style={{ color: "var(--text-muted)", marginBottom: 4 }}>
        Sign in to keep your services and settings in sync across your computers. Only one computer
        can use your account at a time. Web app logins (Gmail, Slack…) don&apos;t sync.
      </p>

      <label htmlFor="account-email" className="sr-only">
        Email
      </label>
      <input
        id="account-email"
        type="email"
        value={email}
        autoComplete="email"
        placeholder="Email"
        disabled={busy}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg outline-none disabled:opacity-60"
        style={fieldStyle}
      />

      {mode !== "reset" && (
        <>
          <label htmlFor="account-password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="account-password"
            value={password}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            placeholder="Password"
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg outline-none"
            style={fieldStyle}
          />
        </>
      )}

      {mode === "sign-up" && (
        <>
          <label htmlFor="account-confirm" className="sr-only">
            Confirm password
          </label>
          <PasswordInput
            id="account-confirm"
            value={confirm}
            autoComplete="new-password"
            placeholder="Confirm password"
            disabled={busy}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg outline-none"
            style={fieldStyle}
          />
        </>
      )}

      <div
        role="alert"
        aria-live="polite"
        className="text-xs"
        style={{ minHeight: 16, color: error ? "var(--danger)" : "var(--success)" }}
      >
        {error || notice}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg text-sm font-semibold cursor-pointer hover:brightness-110 active:translate-y-px disabled:cursor-default disabled:opacity-60"
          style={{ padding: "7px 16px", backgroundColor: "var(--accent)", color: "var(--surface)" }}
        >
          {busy ? "Please wait…" : submitLabel}
        </button>

        {mode === "sign-in" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => switchTo("sign-up")}
              className={linkClass}
              style={{ color: "var(--text-secondary)" }}
            >
              Create account
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => switchTo("reset")}
              className={linkClass}
              style={{ color: "var(--text-secondary)" }}
            >
              Forgot password?
            </button>
          </>
        )}
        {mode !== "sign-in" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => switchTo("sign-in")}
            className={linkClass}
            style={{ color: "var(--text-secondary)" }}
          >
            {mode === "sign-up" ? "I already have an account" : "Back to sign in"}
          </button>
        )}
      </div>
    </form>
  );
}
