import { useEffect, useRef, useState } from "react";
import { IoLockClosed } from "react-icons/io5";

// The workspace lock's front door (issue #102). Covers the whole window, over
// the top of the sidebar and titlebar, until the master password is entered.
//
// It deliberately does NOT use bringUiToFront/sendUiToBack: the main process
// suppresses every service view for as long as the lock is on (see
// setViewsSuppressed in serviceViews.ts), which is stricter than the overlay
// ref-count and can't be unbalanced by a modal closing behind the lock.

type Phase = "idle" | "checking" | "error" | "unlocked";

export default function LockScreen() {
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // The window may have been restored straight onto this screen, so take the
  // caret without waiting for a click.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === "checking" || password.length === 0) return;
    setPhase("checking");
    setError("");
    const result = await window.electronAPI.security.unlock(password);
    if (result.ok) {
      // Main flips the lock state, which unmounts this screen; the tick is the
      // half-second of feedback before that happens.
      setPhase("unlocked");
      return;
    }
    setPhase("error");
    setError(result.error ?? "Wrong password.");
    setPassword("");
    inputRef.current?.focus();
  };

  const disabled = phase === "checking" || phase === "unlocked";
  const inert = disabled || password.length === 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6"
      style={{ backgroundColor: "var(--panel)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace locked"
    >
      <form
        onSubmit={submit}
        className="flex w-full flex-col items-center"
        style={{ maxWidth: 320 }}
      >
        <div
          className="flex items-center justify-center rounded-2xl"
          style={{
            width: 52,
            height: 52,
            backgroundColor: "var(--sidebar)",
            border: "1px solid var(--border)",
            color: phase === "unlocked" ? "var(--success)" : "var(--accent)",
            transition: "color var(--dur-short) var(--ease-out)",
            marginBottom: "var(--space-md)",
          }}
        >
          <IoLockClosed size={22} aria-hidden="true" />
        </div>

        <h1
          className="font-semibold"
          style={{
            fontSize: "var(--text-xl)",
            color: "var(--text-primary)",
            marginBottom: "var(--space-2xs)",
          }}
        >
          Workspace locked
        </h1>
        <p
          className="text-center"
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
            marginBottom: "var(--space-lg)",
          }}
        >
          Enter your master password to carry on.
        </p>

        <label htmlFor="lock-password" className="sr-only">
          Master password
        </label>
        <input
          id="lock-password"
          ref={inputRef}
          type="password"
          value={password}
          autoComplete="current-password"
          disabled={disabled}
          aria-invalid={phase === "error"}
          aria-describedby="lock-error"
          onChange={(e) => {
            setPassword(e.target.value);
            if (phase === "error") setPhase("idle");
          }}
          placeholder="Master password"
          className="w-full rounded-xl outline-none"
          style={{
            padding: "10px 14px",
            fontSize: "var(--text-md)",
            backgroundColor: "var(--sidebar)",
            color: "var(--text-primary)",
            border: `1px solid ${phase === "error" ? "var(--danger)" : "var(--border)"}`,
            transition: "border-color var(--dur-micro) var(--ease-out)",
            opacity: disabled ? 0.6 : 1,
          }}
        />

        {/* Reserved so an error doesn't shove the button down the screen. */}
        <div
          id="lock-error"
          role="alert"
          aria-live="polite"
          className="w-full text-center"
          style={{
            minHeight: 18,
            fontSize: "var(--text-xs)",
            color: "var(--danger)",
            marginTop: "var(--space-xs)",
            opacity: error ? 1 : 0,
            transition: "opacity var(--dur-short) var(--ease-out)",
          }}
        >
          {error || "\u00a0"}
        </div>

        <button
          type="submit"
          disabled={inert}
          // brightness rather than opacity for hover: the disabled state
          // already owns opacity, and an inline style would win over a class.
          className={`w-full rounded-xl font-semibold transition-opacity ${
            inert ? "" : "hover:brightness-110 active:translate-y-px"
          }`}
          style={{
            padding: "10px 16px",
            fontSize: "var(--text-md)",
            marginTop: "var(--space-2xs)",
            backgroundColor: phase === "unlocked" ? "var(--success)" : "var(--accent)",
            color: "var(--surface)",
            cursor: inert ? "default" : "pointer",
            opacity: inert ? 0.5 : 1,
          }}
        >
          {phase === "checking" ? "Unlocking\u2026" : phase === "unlocked" ? "Unlocked" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
