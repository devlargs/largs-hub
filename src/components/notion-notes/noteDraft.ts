import { NotionNote, NotionNoteInput, NotionNoteItem } from "../../types";

// Working state shared by the composer (new notes) and the modal (edits)

export type DraftImage =
  | { kind: "existing"; url: string }
  | { kind: "new"; dataUrl: string; fileName: string; mimeType: string; base64: string }
  | null;

export interface NoteDraft {
  title: string;
  kind: "text" | "list";
  text: string;
  items: NotionNoteItem[];
  pinned: boolean;
  image: DraftImage;
  // Whether the source note had an image — needed to emit a "remove" action
  hadImage: boolean;
}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function emptyDraft(kind: "text" | "list" = "text"): NoteDraft {
  return {
    title: "",
    kind,
    text: "",
    items: kind === "list" ? [{ text: "", checked: false }] : [],
    pinned: false,
    image: null,
    hadImage: false,
  };
}

export function draftFromNote(note: NotionNote): NoteDraft {
  return {
    title: note.title,
    kind: note.kind,
    text: note.text,
    items: note.items.map((item) => ({ ...item })),
    pinned: note.pinned,
    image: note.imageUrl ? { kind: "existing", url: note.imageUrl } : null,
    hadImage: Boolean(note.imageUrl),
  };
}

export function draftIsEmpty(draft: NoteDraft): boolean {
  return (
    draft.title.trim() === "" &&
    draft.text.trim() === "" &&
    !draft.items.some((item) => item.text.trim() !== "") &&
    draft.image === null
  );
}

export function draftToInput(draft: NoteDraft): NotionNoteInput {
  let image: NotionNoteInput["image"];
  if (draft.image?.kind === "new") {
    image = {
      action: "upload",
      fileName: draft.image.fileName,
      mimeType: draft.image.mimeType,
      base64: draft.image.base64,
    };
  } else if (draft.image?.kind === "existing") {
    image = { action: "keep" };
  } else if (draft.hadImage) {
    image = { action: "remove" };
  }
  return {
    title: draft.title.trim(),
    kind: draft.kind,
    text: draft.text,
    items: draft.kind === "list" ? draft.items.filter((item) => item.text.trim() !== "") : [],
    pinned: draft.pinned,
    image,
  };
}

export function noteToInput(note: NotionNote): NotionNoteInput {
  return {
    title: note.title,
    kind: note.kind,
    text: note.text,
    items: note.items.map((item) => ({ ...item })),
    pinned: note.pinned,
    image: note.imageUrl ? { action: "keep" } : undefined,
  };
}

export function readImageFile(
  file: File,
): Promise<{ kind: "new"; dataUrl: string; fileName: string; mimeType: string; base64: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("Image is too large (max 15 MB)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        kind: "new",
        dataUrl,
        fileName: file.name,
        mimeType: file.type || "image/png",
        base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      });
    };
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

export function formatEdited(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Edited ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return `Edited ${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}
