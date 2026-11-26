import { useEffect, useRef, useState } from "react";
import { IoDesktopOutline } from "react-icons/io5";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import { platformLabel } from "@shared/remoteSession";
import type { RemoteLockInfo } from "../../types";
import LockTitlebar from "./LockTitlebar";

// The account is in use on another computer (single active device), so this
// one is locked until it takes the session back. Main hides every service view
// for as long as this shows, the same way it does for the password lock. Shown
// ahead of the password screen; once this computer has the session again the
// password screen follows if that lock is on too.

type Phase = "idle" | "claiming" | "signing-out";

export default function RemoteLockScreen({ info }: { info: RemoteLockInfo }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const os = platformLabel(info.platform);
  const where = os ? `${info.deviceName} (${os})` : info.deviceName;
  const busy = phase !== "idle";

  const claim = async () => {
    if (busy) return;
    setPhase("claiming");
    setError("");
    const { claimSessionHere } = await import("../../lib/cloud-sync");
    const result = await claimSessionHere();
    // On success the session listener unlocks this computer, which unmounts
    // this screen once the account's workspace is in.
    if (!result.ok) {
      setError(result.error);
      setPhase("idle");
    }
  };

  const signOut = async () => {
    if (busy) return;
    setPhase("signing-out");
    setError("");
    try {
      const { signOutOfCloud } = await import("../../lib/cloud-sync");
      await signOutOfCloud();
    } catch (err) {
      console.warn("[account] Sign out failed:", err);
      setError("Couldn't sign out. Try again.");
      setPhase("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6"
      style={{ backgroundColor: "var(--panel)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Largs Hub is open on another device"
    >
      <LockTitlebar />
      <div className="flex w-full flex-col items-center" style={{ maxWidth: 360 }}>
        <div
          className="flex items-center justify-center rounded-2xl"
          style={{
            width: 52,
            height: 52,
            backgroundColor: "var(--sidebar)",
            border: "1px solid var(--border)",
            color: "var(--accent)",
            marginBottom: "var(--space-md)",
          }}
        >
          <IoDesktopOutline size={22} aria-hidden="true" />
        </div>

        <h1
          className="text-center font-semibold"
          style={{
            fontSize: "var(--text-xl)",
            color: "var(--text-primary)",
            marginBottom: "var(--space-2xs)",
          }}
        >
          Largs Hub is open on another device
        </h1>
        <p
          className="text-center"
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
            marginBottom: "var(--space-lg)",
          }}
        >
          {where} is using this account. Your services are paused here.
        </p>

        <button
          ref={buttonRef}
          type="button"
          onClick={claim}
          disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-xl font-semibold transition-opacity ${
            busy ? "" : "hover:brightness-110 active:translate-y-px"
          }`}
          style={{
            padding: "10px 16px",
            fontSize: "var(--text-md)",
            backgroundColor: "var(--accent)",
            color: "var(--surface)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {phase === "claiming" && (
            <AiOutlineLoading3Quarters
              size={14}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {phase === "claiming" ? "Switching…" : "Use Largs Hub here"}
        </button>

        {/* Reserved so an error doesn't shove the link down the screen. */}
        <div
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
          {error || " "}
        </div>

        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="text-sm underline-offset-2 hover:underline cursor-pointer disabled:cursor-default"
          style={{ color: "var(--text-muted)", marginTop: "var(--space-2xs)" }}
        >
          {phase === "signing-out" ? "Signing out…" : "Sign out on this device"}
        </button>
      </div>
    </div>
  );
}
