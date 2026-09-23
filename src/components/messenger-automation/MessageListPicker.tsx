import { useCallback, useEffect, useMemo, useState } from "react";
import { IoAdd } from "react-icons/io5";
import { MessageListGroup } from "../../types";
import { filterLists, paginate, parseMessages } from "../../lib/messageListView";
import ListEditor, { EditorState } from "./ListEditor";
import { ListRow, Pager } from "./ListRow";
import { inputStyle, labelStyle } from "./styles";

// Picker + CRUD for the saved message lists behind the "Random list"
// automation.

interface MessageListPickerProps {
  selectedId: string | null;
  // Fires with the whole group (not just its id) — the panel resolves the
  // messages into the task spec so a later edit can't disturb a running task.
  onSelect: (group: MessageListGroup | null) => void;
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

  const filtered = useMemo(() => filterLists(groups, query), [groups, query]);
  const current = paginate(filtered, page);

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

  const openEditor = (state: EditorState) => {
    setError(null);
    setEditor(state);
  };

  const handleSave = async () => {
    if (!editor) return;
    setBusy(true);
    setError(null);
    try {
      const group: MessageListGroup = {
        id: editor.id ?? crypto.randomUUID(),
        name: editor.name,
        messages: parseMessages(editor.text),
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
      <ListEditor
        editor={editor}
        onChange={setEditor}
        error={error}
        busy={busy}
        onSave={handleSave}
        onCancel={() => {
          setEditor(null);
          setError(null);
        }}
      />
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
          onClick={() => openEditor({ id: null, name: "", text: "" })}
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
          {current.items.map((group) => {
            const active = group.id === selectedId;
            return (
              <ListRow
                key={group.id}
                group={group}
                active={active}
                busy={busy}
                onToggle={() => onSelect(active ? null : group)}
                onEdit={() =>
                  openEditor({ id: group.id, name: group.name, text: group.messages.join("\n") })
                }
                onDelete={() => handleDelete(group)}
              />
            );
          })}
        </div>
      )}

      {current.pageCount > 1 && (
        <Pager page={current.page} pageCount={current.pageCount} onPage={setPage} />
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
