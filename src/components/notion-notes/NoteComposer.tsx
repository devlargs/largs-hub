import { useCallback, useEffect, useRef, useState } from "react";
import { MdOutlineBrush, MdOutlineCheckBox, MdOutlineImage } from "react-icons/md";
import { NotionNoteInput } from "../../types";
import NoteEditor from "./NoteEditor";
import { NoteDraft, draftIsEmpty, draftToInput, emptyDraft, readImageFile } from "./noteDraft";

interface NoteComposerProps {
  onCreate: (input: NotionNoteInput) => void;
}

// "Take a note…" bar that expands into the note editor (Google Keep style).
// Clicking outside or pressing Close saves the note if it has any content.
export default function NoteComposer({ onCreate }: NoteComposerProps) {
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [focusTarget, setFocusTarget] = useState<"title" | "text" | "list">("text");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<NoteDraft | null>(null);
  draftRef.current = draft;

  const close = useCallback(() => {
    const current = draftRef.current;
    if (current && !draftIsEmpty(current)) {
      onCreate(draftToInput(current));
    }
    setDraft(null);
  }, [onCreate]);

  const expanded = draft !== null;
  useEffect(() => {
    if (!expanded) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, close]);

  const openWith = (kind: "text" | "list", target: "title" | "text" | "list") => {
    setError(null);
    setFocusTarget(target);
    setDraft(emptyDraft(kind));
  };

  const handleImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const image = await readImageFile(file);
      setFocusTarget("title");
      setDraft({ ...emptyDraft("text"), image });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the image.");
    }
  };

  return (
    <div ref={containerRef} style={{ maxWidth: 600, margin: "0 auto" }}>
      {!expanded ? (
        <div
          className="flex items-center rounded-lg"
          style={{
            background: "var(--sidebar)",
            border: "1px solid var(--border)",
            boxShadow: "0 1px 6px rgba(0,0,0,0.25)",
            padding: "4px 8px 4px 16px",
          }}
        >
          <button
            onClick={() => openWith("text", "text")}
            className="flex-1 text-left cursor-text"
            style={{
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "transparent",
              border: "none",
            }}
          >
            Take a note…
          </button>
          <button
            onClick={() => openWith("list", "list")}
            title="New list"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-sidebar-hover cursor-pointer"
            style={{ color: "var(--text-secondary)", background: "transparent", border: "none" }}
          >
            <MdOutlineCheckBox size={20} />
          </button>
          <button
            disabled
            title="Drawing isn't supported"
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              color: "var(--text-secondary)",
              opacity: 0.35,
              background: "transparent",
              border: "none",
            }}
          >
            <MdOutlineBrush size={20} />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            title="New note with image"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-sidebar-hover cursor-pointer"
            style={{ color: "var(--text-secondary)", background: "transparent", border: "none" }}
          >
            <MdOutlineImage size={20} />
          </button>
        </div>
      ) : (
        <div
          className="rounded-lg"
          style={{
            background: "var(--sidebar)",
            border: "1px solid var(--border)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
          }}
        >
          <NoteEditor draft={draft} onChange={setDraft} onClose={close} autoFocus={focusTarget} />
        </div>
      )}
      {error && !expanded && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#f38ba8", textAlign: "center" }}>{error}</div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
    </div>
  );
}
