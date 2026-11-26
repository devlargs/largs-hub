import { useRef } from "react";
import Modal from "../ui/Modal";
import { useCloudStore, type WorkspaceChoice } from "../../store/cloud";

// Asked once, the first time this computer signs in to an account that already
// has a workspace while it has services of its own: which one to keep. The
// Modal shell hides the active service view while it's open (the UI-layer
// ref-count, CLAUDE.md), so it shows above the service pages.

const buttonBase =
  "w-full rounded-lg text-sm text-left cursor-pointer hover:brightness-110 active:translate-y-px";

export default function WorkspaceChoiceDialog() {
  const choice = useCloudStore((s) => s.choice);
  // What was picked, so closing the shell (Escape, the backdrop) after a pick
  // doesn't also count as Cancel
  const picked = useRef<WorkspaceChoice | null>(null);
  if (!choice) return null;

  const finish = () => {
    choice.resolve(picked.current ?? "cancel");
    picked.current = null;
  };

  return (
    <Modal label="Choose a workspace" onClose={finish} width={440} padding={28}>
      {(close) => {
        const pick = (value: WorkspaceChoice) => {
          picked.current = value;
          close();
        };
        return (
          <>
            <h2
              className="font-semibold"
              style={{
                fontSize: "var(--text-lg)",
                color: "var(--text-primary)",
                marginBottom: "var(--space-2xs)",
              }}
            >
              Your account already has a workspace
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              It was last saved from {choice.fromDevice}. This computer has its own services. Pick
              which one to keep; the other is replaced.
            </p>

            <div
              className="flex flex-col"
              style={{ gap: "var(--space-xs)", marginTop: "var(--space-lg)" }}
            >
              <button
                type="button"
                onClick={() => pick("cloud")}
                className={`${buttonBase} font-semibold`}
                style={{
                  padding: "10px 14px",
                  backgroundColor: "var(--accent)",
                  color: "var(--surface)",
                }}
              >
                Use my account&apos;s workspace
                <span className="block text-xs font-normal" style={{ opacity: 0.85 }}>
                  Replaces this computer&apos;s services and settings. Services that aren&apos;t in
                  the account are removed, along with their logins.
                </span>
              </button>
              <button
                type="button"
                onClick={() => pick("local")}
                className={`${buttonBase} font-medium`}
                style={{
                  padding: "10px 14px",
                  backgroundColor: "var(--sidebar-hover)",
                  color: "var(--text-primary)",
                }}
              >
                Replace my account&apos;s workspace with this computer&apos;s
                <span className="block text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                  The account&apos;s services and settings are overwritten, on every computer.
                </span>
              </button>
              <button
                type="button"
                onClick={() => pick("cancel")}
                className="self-end rounded-lg text-sm font-medium cursor-pointer hover:brightness-110"
                style={{ padding: "8px 16px", color: "var(--text-muted)" }}
              >
                Cancel and sign out
              </button>
            </div>
          </>
        );
      }}
    </Modal>
  );
}
