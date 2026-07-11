import { useEffect, useRef, useState } from "react";
import { NotionNote, NotionNoteInput } from "../../types";
import NoteEditor from "./NoteEditor";
import { draftFromNote, draftToInput, formatEdited } from "./noteDraft";

interface NoteModalProps {
  note: NotionNote;
  onSave: (input: NotionNoteInput) => void;
  onDelete: () => void;
  onClose: () => void;
}

// Edit dialog for an existing note. Closing (button, backdrop, or Escape)
// saves the note if anything changed — same behavior as Google Keep.
// Note: this page has no WebContentsView under it, so no bringUiToFront()
// z-order dance is needed here.
export default function NoteModal({ note, onSave, onDelete, onClose }: NoteModalProps) {
  const [draft, setDraft] = useState(() => draftFromNote(note));
  const initialInput = useRef(JSON.stringify(draftToInput(draftFromNote(note))));

  const handleClose = () => {
    const input = draftToInput(draft);
    if (JSON.stringify(input) !== initialInput.current) {
      onSave(input);
    }
    onClose();
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.6)", padding: "7vh 24px 40px" }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-lg w-full"
        style={{
          maxWidth: 600,
          background: "var(--sidebar)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <NoteEditor
          draft={draft}
          onChange={setDraft}
          onClose={handleClose}
          onDelete={onDelete}
          editedLabel={formatEdited(note.editedAt)}
        />
      </div>
    </div>
  );
}
