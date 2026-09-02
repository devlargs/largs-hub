import { MdOutlineWarningAmber } from "react-icons/md";
import Modal from "./Modal";

// The app's confirmation prompt (issue #104). Replaces Electron's native
// message box, which drew a Windows task dialog in the middle of a Catppuccin
// app — different type, different buttons, different everything.
//
// Cancel comes first in the DOM so it takes focus when the dialog opens: the
// native box defaulted to Cancel too, and a destructive action shouldn't be one
// stray Enter away.

export type ConfirmTone = "default" | "danger";

export interface ConfirmDialogProps {
  title: string;
  /** One sentence on what happens, in plain words. */
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const accent = tone === "danger" ? "var(--danger)" : "var(--accent)";

  return (
    <Modal label={title} onClose={onClose} width={400} padding={28}>
      {(close) => (
        <>
          <div className="flex" style={{ gap: "var(--space-sm)" }}>
            {tone === "danger" && (
              <div
                className="flex shrink-0 items-center justify-center rounded-xl"
                style={{
                  width: 34,
                  height: 34,
                  color: accent,
                  background: "color-mix(in srgb, var(--danger) 14%, transparent)",
                }}
              >
                <MdOutlineWarningAmber size={19} aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
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
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{body}</p>
            </div>
          </div>

          <div
            className="flex justify-end"
            style={{ gap: "var(--space-xs)", marginTop: "var(--space-lg)" }}
          >
            <button
              type="button"
              onClick={close}
              className="rounded-lg text-sm font-medium cursor-pointer hover:brightness-110 active:translate-y-px"
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--sidebar-hover)",
                color: "var(--text-primary)",
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                close();
              }}
              className="rounded-lg text-sm font-semibold cursor-pointer hover:brightness-110 active:translate-y-px"
              style={{ padding: "8px 16px", backgroundColor: accent, color: "var(--surface)" }}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
