import { messageCountLabel, parseMessages } from "../../lib/messageListView";
import { Field, inputStyle, labelStyle } from "./styles";

export interface EditorState {
  // null id = a list being created
  id: string | null;
  name: string;
  // One message per line; typing JSON would be worse.
  text: string;
}

interface ListEditorProps {
  editor: EditorState;
  onChange: (editor: EditorState) => void;
  error: string | null;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}

// Creating or editing one saved message list.
export default function ListEditor({
  editor,
  onChange,
  error,
  busy,
  onSave,
  onCancel,
}: ListEditorProps) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <Field label="List name">
        <input
          type="text"
          value={editor.name}
          autoFocus
          onChange={(e) => onChange({ ...editor, name: e.target.value })}
          placeholder="Good morning lines"
          className="text-sm outline-none rounded-lg"
          style={inputStyle}
        />
      </Field>
      <Field label="Messages — one per line">
        <textarea
          value={editor.text}
          onChange={(e) => onChange({ ...editor, text: e.target.value })}
          rows={6}
          placeholder={"something1\nsomething 2\nsomething3"}
          className="text-sm outline-none rounded-lg resize-none"
          style={inputStyle}
        />
        <span className="text-2xs" style={labelStyle}>
          {messageCountLabel(parseMessages(editor.text).length)} · blank lines are ignored
        </span>
      </Field>
      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="flex" style={{ gap: 8 }}>
        <button
          onClick={onSave}
          disabled={busy}
          className="text-sm font-medium rounded-lg flex-1 transition-colors"
          style={{
            padding: "8px 12px",
            backgroundColor: busy ? "var(--surface)" : "var(--accent)",
            color: busy ? "var(--text-muted)" : "#fff",
          }}
        >
          Save list
        </button>
        <button
          onClick={onCancel}
          className="text-sm rounded-lg transition-colors"
          style={{
            padding: "8px 12px",
            backgroundColor: "var(--surface)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
