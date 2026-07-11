import { ReactNode, useEffect, useRef, useState } from "react";
import {
  MdAdd,
  MdCheckBox,
  MdCheckBoxOutlineBlank,
  MdClose,
  MdDragIndicator,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight,
  MdMoreVert,
  MdOutlineArchive,
  MdOutlineDelete,
  MdOutlineFormatColorText,
  MdOutlineImage,
  MdOutlineNotificationAdd,
  MdOutlinePalette,
  MdOutlinePersonAddAlt,
  MdOutlinePushPin,
  MdPushPin,
  MdRedo,
  MdUndo,
} from "react-icons/md";
import { NoteDraft, readImageFile } from "./noteDraft";

interface NoteEditorProps {
  draft: NoteDraft;
  onChange: (draft: NoteDraft) => void;
  onClose: () => void;
  onDelete?: () => void;
  // Preformatted label, e.g. "Edited 5:11 AM" (shown in the edit modal)
  editedLabel?: string;
  autoFocus?: "title" | "text" | "list";
}

function ToolbarButton({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
        disabled ? "" : "hover:bg-sidebar-hover cursor-pointer"
      }`}
      style={{
        color: "var(--text-secondary)",
        opacity: disabled ? 0.35 : 1,
        background: "transparent",
        border: "none",
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );
}

export default function NoteEditor({
  draft,
  onChange,
  onClose,
  onDelete,
  editedLabel,
  autoFocus,
}: NoteEditorProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus === "title") titleRef.current?.focus();
    else if (autoFocus === "text") textRef.current?.focus();
    else if (autoFocus === "list") itemRefs.current[0]?.focus();
    // Only on mount — refocusing on later renders would steal the caret
  }, []);

  // Auto-grow the textarea with its content
  useEffect(() => {
    const el = textRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [draft.text, draft.kind]);

  useEffect(() => {
    if (pendingFocus === null) return;
    itemRefs.current[pendingFocus]?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const setItemText = (index: number, text: string) =>
    onChange({
      ...draft,
      items: draft.items.map((item, i) => (i === index ? { ...item, text } : item)),
    });

  const toggleItemChecked = (index: number) =>
    onChange({
      ...draft,
      items: draft.items.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item)),
    });

  const removeItem = (index: number) =>
    onChange({ ...draft, items: draft.items.filter((_, i) => i !== index) });

  const insertItemAfter = (index: number) => {
    const items = [...draft.items];
    items.splice(index + 1, 0, { text: "", checked: false });
    onChange({ ...draft, items });
    setPendingFocus(index + 1);
  };

  const addItem = () => {
    onChange({ ...draft, items: [...draft.items, { text: "", checked: false }] });
    setPendingFocus(draft.items.length);
  };

  const handleItemKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      insertItemAfter(index);
    } else if (
      event.key === "Backspace" &&
      draft.items[index]?.text === "" &&
      draft.items.length > 1
    ) {
      event.preventDefault();
      removeItem(index);
      setPendingFocus(Math.max(0, index - 1));
    }
  };

  const handleImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLocalError(null);
    try {
      const image = await readImageFile(file);
      onChange({ ...draft, image });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not read the image.");
    }
  };

  const toggleCheckboxes = () => {
    setMenuOpen(false);
    if (draft.kind === "text") {
      const items = draft.text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((text) => ({ text, checked: false }));
      onChange({
        ...draft,
        kind: "list",
        text: "",
        items: items.length > 0 ? items : [{ text: "", checked: false }],
      });
    } else {
      const text = [draft.text, ...draft.items.map((item) => item.text)]
        .filter((line) => line !== "")
        .join("\n");
      onChange({ ...draft, kind: "text", text, items: [] });
    }
  };

  const rows = draft.items.map((item, index) => ({ item, index }));
  const activeRows = rows.filter((row) => !row.item.checked);
  const doneRows = rows.filter((row) => row.item.checked);

  return (
    <div className="flex flex-col">
      {draft.image && (
        <div className="relative group/image">
          <img
            src={draft.image.kind === "new" ? draft.image.dataUrl : draft.image.url}
            alt=""
            className="w-full block"
            style={{
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              maxHeight: 360,
              objectFit: "cover",
            }}
            draggable={false}
          />
          <button
            onClick={() => onChange({ ...draft, image: null })}
            title="Remove image"
            className="absolute flex items-center justify-center cursor-pointer opacity-0 group-hover/image:opacity-100 transition-opacity"
            style={{
              right: 8,
              bottom: 8,
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
            }}
          >
            <MdOutlineDelete size={18} />
          </button>
        </div>
      )}

      {/* Title + pin */}
      <div className="flex items-start" style={{ padding: "10px 10px 0 16px", gap: 8 }}>
        <input
          ref={titleRef}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="Title"
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", border: "none", padding: "4px 0" }}
        />
        <button
          onClick={() => onChange({ ...draft, pinned: !draft.pinned })}
          title={draft.pinned ? "Unpin note" : "Pin note"}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-sidebar-hover cursor-pointer"
          style={{
            color: draft.pinned ? "var(--text-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            flexShrink: 0,
          }}
        >
          {draft.pinned ? <MdPushPin size={18} /> : <MdOutlinePushPin size={18} />}
        </button>
      </div>

      {/* Text body */}
      {(draft.kind === "text" || draft.text !== "") && (
        <textarea
          ref={textRef}
          value={draft.text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
          placeholder={draft.kind === "text" ? "Take a note…" : ""}
          rows={1}
          className="bg-transparent outline-none resize-none"
          style={{
            padding: "8px 16px",
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--text-primary)",
            border: "none",
            overflow: "hidden",
          }}
        />
      )}

      {/* Checklist body */}
      {draft.kind === "list" && (
        <div style={{ padding: "6px 0 2px" }}>
          {activeRows.map(({ item, index }) => (
            <div
              key={index}
              className="group/item flex items-center"
              style={{ padding: "1px 10px 1px 8px", gap: 4 }}
            >
              <MdDragIndicator
                size={16}
                className="opacity-0 group-hover/item:opacity-60"
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />
              <button
                onClick={() => toggleItemChecked(index)}
                className="flex items-center justify-center cursor-pointer"
                style={{
                  color: "var(--text-muted)",
                  background: "transparent",
                  border: "none",
                  width: 24,
                  height: 24,
                  flexShrink: 0,
                }}
              >
                <MdCheckBoxOutlineBlank size={16} />
              </button>
              <input
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                value={item.text}
                onChange={(e) => setItemText(index, e.target.value)}
                onKeyDown={(e) => handleItemKeyDown(e, index)}
                placeholder="List item"
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 14, color: "var(--text-primary)", border: "none", padding: "3px 0" }}
              />
              <button
                onClick={() => removeItem(index)}
                title="Delete item"
                className="flex items-center justify-center cursor-pointer opacity-0 group-hover/item:opacity-100 rounded-full hover:bg-sidebar-hover"
                style={{
                  color: "var(--text-secondary)",
                  background: "transparent",
                  border: "none",
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                }}
              >
                <MdClose size={16} />
              </button>
            </div>
          ))}

          <button
            onClick={addItem}
            className="flex items-center cursor-pointer hover:bg-sidebar-hover transition-colors"
            style={{
              gap: 12,
              padding: "6px 16px 6px 30px",
              color: "var(--text-secondary)",
              fontSize: 14,
              background: "transparent",
              border: "none",
              width: "100%",
              textAlign: "left",
            }}
          >
            <MdAdd size={18} style={{ color: "var(--text-muted)" }} />
            List item
          </button>

          {doneRows.length > 0 && (
            <div style={{ marginTop: 4, borderTop: "1px solid var(--border)", paddingTop: 4 }}>
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center cursor-pointer"
                style={{
                  gap: 4,
                  padding: "4px 16px",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  background: "transparent",
                  border: "none",
                }}
              >
                {showCompleted ? <MdKeyboardArrowDown size={18} /> : <MdKeyboardArrowRight size={18} />}
                {doneRows.length} Completed item{doneRows.length === 1 ? "" : "s"}
              </button>
              {showCompleted &&
                doneRows.map(({ item, index }) => (
                  <div
                    key={index}
                    className="group/item flex items-center"
                    style={{ padding: "1px 10px 1px 30px", gap: 4 }}
                  >
                    <button
                      onClick={() => toggleItemChecked(index)}
                      className="flex items-center justify-center cursor-pointer"
                      style={{
                        color: "var(--text-muted)",
                        background: "transparent",
                        border: "none",
                        width: 24,
                        height: 24,
                        flexShrink: 0,
                      }}
                    >
                      <MdCheckBox size={16} />
                    </button>
                    <input
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      value={item.text}
                      onChange={(e) => setItemText(index, e.target.value)}
                      onKeyDown={(e) => handleItemKeyDown(e, index)}
                      className="flex-1 bg-transparent outline-none"
                      style={{
                        fontSize: 14,
                        color: "var(--text-muted)",
                        textDecoration: "line-through",
                        border: "none",
                        padding: "3px 0",
                      }}
                    />
                    <button
                      onClick={() => removeItem(index)}
                      title="Delete item"
                      className="flex items-center justify-center cursor-pointer opacity-0 group-hover/item:opacity-100 rounded-full hover:bg-sidebar-hover"
                      style={{
                        color: "var(--text-secondary)",
                        background: "transparent",
                        border: "none",
                        width: 26,
                        height: 26,
                        flexShrink: 0,
                      }}
                    >
                      <MdClose size={16} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {(editedLabel || localError) && (
        <div className="flex items-center" style={{ padding: "4px 16px 0" }}>
          {localError && <span style={{ fontSize: 12, color: "#f38ba8" }}>{localError}</span>}
          <span className="flex-1" />
          {editedLabel && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{editedLabel}</span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center" style={{ padding: "6px 8px", gap: 2 }}>
        <ToolbarButton disabled icon={<MdOutlineFormatColorText size={18} />} title="Formatting isn't available" />
        <ToolbarButton disabled icon={<MdOutlinePalette size={18} />} title="Background colors aren't available" />
        <ToolbarButton disabled icon={<MdOutlineNotificationAdd size={18} />} title="Reminders aren't available" />
        <ToolbarButton disabled icon={<MdOutlinePersonAddAlt size={18} />} title="Collaborators aren't available" />
        <ToolbarButton
          icon={<MdOutlineImage size={18} />}
          title="Add image"
          onClick={() => fileRef.current?.click()}
        />
        <ToolbarButton disabled icon={<MdOutlineArchive size={18} />} title="Archiving isn't available" />
        <div className="relative">
          <ToolbarButton icon={<MdMoreVert size={18} />} title="More" onClick={() => setMenuOpen((v) => !v)} />
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                className="absolute z-20 rounded-lg"
                style={{
                  bottom: 36,
                  left: 0,
                  minWidth: 180,
                  padding: "4px 0",
                  background: "var(--context-bg)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                }}
              >
                {onDelete && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="block w-full text-left cursor-pointer hover:bg-sidebar-hover"
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      background: "transparent",
                      border: "none",
                    }}
                  >
                    Delete note
                  </button>
                )}
                <button
                  onClick={toggleCheckboxes}
                  className="block w-full text-left cursor-pointer hover:bg-sidebar-hover"
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    background: "transparent",
                    border: "none",
                  }}
                >
                  {draft.kind === "list" ? "Hide checkboxes" : "Show checkboxes"}
                </button>
              </div>
            </>
          )}
        </div>
        <ToolbarButton disabled icon={<MdUndo size={18} />} title="Undo isn't available" />
        <ToolbarButton disabled icon={<MdRedo size={18} />} title="Redo isn't available" />
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg hover:bg-sidebar-hover transition-colors"
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            background: "transparent",
            border: "none",
          }}
        >
          Close
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
    </div>
  );
}
