import { useCallback, useEffect, useMemo, useState } from "react";
import { IoAdd, IoPencil, IoTrash, IoChevronBack, IoChevronForward } from "react-icons/io5";
import { MessageListGroup } from "../types";

// Picker + CRUD for the saved message lists behind the "Random list"
// automation. The lists are local and small, so search and paging happen here
// rather than in the IPC layer.
const PAGE_SIZE = 10;

interface MessageListPickerProps {
  selectedId: string | null;
  // Fires with the whole group (not just its id) — the panel resolves the
  // messages into the task spec so a later edit can't disturb a running task.
  onSelect: (group: MessageListGroup | null) => void;
}

interface EditorState {
  // null id = a list being created
  id: string | null;
  name: string;
  // One message per line; typing JSON would be worse.
  text: string;
}

const inputStyle = {
  padding: "8px 12px",
  backgroundColor: "var(--surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
} as const;

const labelStyle = { color: "var(--text-muted)" } as const;

export function parseMessages(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function MessageListPicker({ selectedId, onSelect }: MessageListPickerProps) {
  const [groups, setGroups] = useState<MessageListGroup[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.electronAPI?.listGroups.list().then(setGroups);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle ? groups.filter((g) => g.name.toLowerCase().includes(needle)) : groups;
    return [...matching].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [groups, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A deletion or a new search can strand the view past the last page.
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [query]);

  // Keep the panel's copy of the selection in step with edits and deletions.
  const applyGroups = useCallback(
    (updated: MessageListGroup[]) => {
      setGroups(updated);
      if (selectedId) {
        onSelect(updated.find((g) => g.id === selectedId) ?? null);
      }
    },
    [selectedId, onSelect],
  );

  const handleSave = async () => {
    if (!editor) return;
    const messages = parseMessages(editor.text);
    setBusy(true);
    setError(null);
    try {
      const group: MessageListGroup = {
        id: editor.id ?? crypto.randomUUID(),
        name: editor.name,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = editor.id
        ? await window.electronAPI.listGroups.update(group)
        : await window.electronAPI.listGroups.add(group);
      if (!result.ok) {
        setError(result.error ?? "Could not save the list");
        return;
      }
      setGroups(result.groups);
      setEditor(null);
      // Creating a list selects it — the usual next step is starting it.
      const saved = result.groups.find((g) => g.id === group.id) ?? null;
      if (!editor.id || selectedId === group.id) onSelect(saved);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (group: MessageListGroup) => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.listGroups.remove(group.id);
      if (!result.ok) {
        setError(result.error ?? "Could not delete the list");
        return;
      }
      applyGroups(result.groups);
      if (editor?.id === group.id) setEditor(null);
    } finally {
      setBusy(false);
    }
  };

  if (editor) {
    return (
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div className="flex flex-col" style={{ gap: 4 }}>
          <label className="text-xs font-medium" style={labelStyle}>
            List name
          </label>
          <input
            type="text"
            value={editor.name}
            autoFocus
            onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            placeholder="Good morning lines"
            className="text-sm outline-none rounded-lg"
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col" style={{ gap: 4 }}>
          <label className="text-xs font-medium" style={labelStyle}>
            Messages — one per line
          </label>
          <textarea
            value={editor.text}
            onChange={(e) => setEditor({ ...editor, text: e.target.value })}
            rows={6}
            placeholder={"something1\nsomething 2\nsomething3"}
            className="text-sm outline-none rounded-lg resize-none"
            style={inputStyle}
          />
          <span className="text-2xs" style={labelStyle}>
            {parseMessages(editor.text).length} message
            {parseMessages(editor.text).length === 1 ? "" : "s"} · blank lines are ignored
          </span>
        </div>
        {error && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="flex" style={{ gap: 8 }}>
          <button
            onClick={handleSave}
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
            onClick={() => {
              setEditor(null);
              setError(null);
            }}
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

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex" style={{ gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lists…"
          className="text-sm outline-none rounded-lg flex-1 min-w-0"
          style={inputStyle}
        />
        <button
          onClick={() => {
            setError(null);
            setEditor({ id: null, name: "", text: "" });
          }}
          className="flex items-center justify-center rounded-lg shrink-0 transition-colors"
          style={{ width: 36, backgroundColor: "var(--accent)", color: "#fff" }}
          aria-label="New list"

          title="New list"
        >
          <IoAdd size={18} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs" style={labelStyle}>
          {groups.length === 0
            ? "No lists yet — create one to send a random message from it."
            : "No list matches that search."}
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 4 }}>
          {visible.map((group) => {
            const active = group.id === selectedId;
            return (
              <div
                key={group.id}
                className="flex items-center rounded-lg"
                style={{
                  gap: 6,
                  padding: "6px 8px",
                  backgroundColor: active ? "var(--sidebar-active)" : "var(--surface)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <button
                  onClick={() => onSelect(active ? null : group)}
                  className="flex flex-col flex-1 min-w-0 text-left"
                  aria-label={group.messages.join("\n")}

                  title={group.messages.join("\n")}
                >
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {group.name}
                  </span>
                  <span className="text-2xs" style={labelStyle}>
                    {group.messages.length} message{group.messages.length === 1 ? "" : "s"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    setEditor({ id: group.id, name: group.name, text: group.messages.join("\n") });
                  }}
                  className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors shrink-0"
                  style={{ width: 24, height: 24, color: "var(--text-muted)" }}
                  aria-label="Edit list"

                  title="Edit list"
                >
                  <IoPencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(group)}
                  disabled={busy}
                  className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors shrink-0"
                  style={{ width: 24, height: 24, color: "var(--text-muted)" }}
                  aria-label="Delete list"

                  title="Delete list"
                >
                  <IoTrash size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center" style={{ gap: 8 }}>
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors disabled:opacity-40"
            style={{ width: 24, height: 24, color: "var(--text-muted)" }}
            aria-label="Previous page"

            title="Previous page"
          >
            <IoChevronBack size={13} />
          </button>
          <span className="text-2xs tabular-nums" style={labelStyle}>
            {safePage + 1} / {pageCount}
          </span>
          <button
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors disabled:opacity-40"
            style={{ width: 24, height: 24, color: "var(--text-muted)" }}
            aria-label="Next page"

            title="Next page"
          >
            <IoChevronForward size={13} />
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
