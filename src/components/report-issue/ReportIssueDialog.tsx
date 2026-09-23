import { useEffect, useState } from "react";
import type { IssueCreated } from "../../types";
import Modal from "../ui/Modal";
import { insertAt, replacePlaceholder, uploadPlaceholder } from "../../lib/issueText";

interface ReportIssueDialogProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

const fieldStyle = {
  padding: "10px 14px",
  backgroundColor: "var(--panel)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
} as const;

const mutedStyle = { color: "var(--text-muted)" } as const;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Files a GitHub issue on largs-hub, assigned to devlargs. The description is
// markdown; a pasted image is uploaded (main commits it to the issue-images
// branch) and lands in the text as ![image](…), like GitHub's own editor.
export default function ReportIssueDialog({ onClose, onOpenSettings }: ReportIssueDialogProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [uploads, setUploads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<IssueCreated | null>(null);

  useEffect(() => {
    window.electronAPI?.github
      .getStatus()
      .then((status) => setConnected(status.connected))
      .catch(() => setConnected(false));
  }, []);

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return; // plain text pastes as usual
    e.preventDefault();
    const area = e.currentTarget;
    for (const file of images) {
      const placeholder = uploadPlaceholder(file.name || "image.png");
      const next = insertAt(area.value, area.selectionStart, placeholder, area.selectionEnd);
      setBody(next.text);
      requestAnimationFrame(() => area.setSelectionRange(next.cursor, next.cursor));
      setUploads((n) => n + 1);
      try {
        const result = await window.electronAPI.github.uploadImage(await readAsDataUrl(file));
        setBody((text) => replacePlaceholder(text, placeholder, result.markdown ?? ""));
        if (!result.ok) setError(result.error ?? "The image couldn't be uploaded.");
      } catch {
        setBody((text) => replacePlaceholder(text, placeholder, ""));
        setError("The image couldn't be uploaded.");
      } finally {
        setUploads((n) => n - 1);
      }
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.github.createIssue({ title, body });
      if (result.ok && result.issue) setCreated(result.issue);
      else setError(result.error ?? "The issue couldn't be created.");
    } finally {
      setBusy(false);
    }
  };

  const canCreate = !busy && uploads === 0 && title.trim().length > 0;

  return (
    <Modal label="Report an issue" onClose={onClose} width={560} maxHeight="90vh" padding={28}>
      {(close) => (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Report an issue
          </h2>

          {connected === false ? (
            <>
              <p className="text-sm" style={mutedStyle}>
                Filing an issue needs a GitHub token. Add one in Settings → GitHub.
              </p>
              <Footer onCancel={close}>
                <PrimaryButton onClick={onOpenSettings} enabled>
                  Open Settings
                </PrimaryButton>
              </Footer>
            </>
          ) : created ? (
            <>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Issue #{created.number} created and assigned to devlargs.
              </p>
              <Footer onCancel={close} cancelLabel="Close">
                <PrimaryButton
                  onClick={() => window.electronAPI?.openLinkExternal(created.url)}
                  enabled
                >
                  Open on GitHub
                </PrimaryButton>
              </Footer>
            </>
          ) : (
            <>
              <input
                type="text"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                aria-label="Title"
                maxLength={256}
                className="text-sm outline-none rounded-lg"
                style={fieldStyle}
              />
              <div className="flex flex-col" style={{ gap: 6 }}>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onPaste={handlePaste}
                  rows={10}
                  placeholder="What happened? What did you expect?"
                  aria-label="Description"
                  className="text-sm outline-none rounded-lg resize-y"
                  style={{ ...fieldStyle, fontFamily: "var(--font-figure)", minHeight: 160 }}
                />
                <span className="text-xs" style={mutedStyle}>
                  {uploads > 0
                    ? "Uploading image…"
                    : "Markdown supported · paste an image to attach it"}
                </span>
              </div>
              {error && (
                <p className="text-xs" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              )}
              <Footer onCancel={close}>
                <PrimaryButton onClick={handleCreate} enabled={canCreate}>
                  {busy ? "Creating…" : "Create issue"}
                </PrimaryButton>
              </Footer>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Footer({
  onCancel,
  cancelLabel = "Cancel",
  children,
}: {
  onCancel: () => void;
  cancelLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-end" style={{ gap: 10, marginTop: 4 }}>
      <button
        onClick={onCancel}
        className="text-sm cursor-pointer rounded-lg"
        style={{
          padding: "8px 18px",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        {cancelLabel}
      </button>
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick,
  enabled,
  children,
}: {
  onClick: () => void;
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      className="text-sm font-semibold rounded-lg transition-opacity"
      style={{
        padding: "8px 18px",
        backgroundColor: "var(--accent)",
        color: "var(--surface)",
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? "pointer" : "default",
      }}
    >
      {children}
    </button>
  );
}
