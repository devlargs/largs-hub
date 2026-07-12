import { useCallback, useEffect, useRef, useState } from "react";
import { MdOutlineSettings, MdRefresh } from "react-icons/md";
import { NotionNote, NotionNoteInput, NotionNotesState, Service } from "../../types";
import NoteCard from "./NoteCard";
import NoteComposer from "./NoteComposer";
import NoteModal from "./NoteModal";
import NotionSetup from "./NotionSetup";
import { noteToInput } from "./noteDraft";

interface NotionNotesPageProps {
  service: Service;
}

// Notes already fetched this session, keyed by service id, with the time of the
// last successful server fetch. The page unmounts whenever you switch to another
// service, so without this the whole database (query every page + fetch every
// block) would be re-fetched on every visit. Seeding from here shows the
// last-known notes instantly; a background refresh then picks up remote changes,
// but only if the cached copy is older than CACHE_TTL_MS so rapidly toggling
// between services doesn't hammer the Notion API.
const notesCache = new Map<string, { notes: NotionNote[]; fetchedAt: number }>();
const CACHE_TTL_MS = 30_000;

// Google Keep-style notes page backed by the user's own Notion database.
// Rendered in the React UI view — internal services have no WebContentsView.
export default function NotionNotesPage({ service }: NotionNotesPageProps) {
  const serviceId = service.id;
  // A cached set of notes means we were "ready" last visit — assume it still is
  // so the notes render immediately; the getState check below corrects it if not.
  const [state, setState] = useState<"loading" | NotionNotesState>(() =>
    notesCache.has(serviceId) ? "ready" : "loading",
  );
  const [notes, setNotes] = useState<NotionNote[]>(() => notesCache.get(serviceId)?.notes ?? []);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Skip applying stale server responses while newer edits are in flight
  const pendingByNote = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.notionNotes.getState(serviceId).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  // Keep the session cache in sync with what's on screen so the next visit
  // (and optimistic edits made here) survive unmount. fetchedAt is preserved —
  // only a real server fetch (loadNotes) advances it, so local edits don't make
  // stale data look fresh.
  useEffect(() => {
    if (state !== "ready") return;
    const prev = notesCache.get(serviceId);
    notesCache.set(serviceId, { notes, fetchedAt: prev?.fetchedAt ?? 0 });
  }, [serviceId, state, notes]);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    setError(null);
    const res = await window.electronAPI.notionNotes.list(serviceId);
    if (res.ok && res.notes) {
      setNotes(res.notes);
      notesCache.set(serviceId, { notes: res.notes, fetchedAt: Date.now() });
    } else {
      setError(res.error || "Failed to load notes.");
    }
    setNotesLoading(false);
  }, [serviceId]);

  // On mount, refresh in the background — but skip it while the cached copy is
  // still fresh, so toggling between services doesn't refetch every time. The
  // manual Refresh button calls loadNotes directly and bypasses this guard.
  useEffect(() => {
    if (state !== "ready") return;
    const cached = notesCache.get(serviceId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
    void loadNotes();
  }, [state, serviceId, loadNotes]);

  const applyServerNote = useCallback((noteId: string, note: NotionNote | undefined) => {
    const remaining = (pendingByNote.current.get(noteId) || 1) - 1;
    if (remaining <= 0) pendingByNote.current.delete(noteId);
    else pendingByNote.current.set(noteId, remaining);
    // Only accept the server's version once no newer local edit is pending
    if (note && remaining <= 0) {
      setNotes((current) => current.map((n) => (n.id === noteId ? note : n)));
    }
  }, []);

  const handleCreate = useCallback(
    async (input: NotionNoteInput) => {
      setSaving((c) => c + 1);
      const res = await window.electronAPI.notionNotes.create(serviceId, input);
      setSaving((c) => c - 1);
      if (res.ok && res.note) {
        const note = res.note;
        setNotes((current) => [note, ...current]);
      } else {
        setError(res.error || "Failed to save the note.");
      }
    },
    [serviceId],
  );

  const saveUpdate = useCallback(
    async (noteId: string, input: NotionNoteInput) => {
      pendingByNote.current.set(noteId, (pendingByNote.current.get(noteId) || 0) + 1);
      setSaving((c) => c + 1);
      const res = await window.electronAPI.notionNotes.update(serviceId, noteId, input);
      setSaving((c) => c - 1);
      if (res.ok) {
        applyServerNote(noteId, res.note);
      } else {
        applyServerNote(noteId, undefined);
        setError(res.error || "Failed to save the note.");
        void loadNotes();
      }
    },
    [serviceId, applyServerNote, loadNotes],
  );

  const handleToggleItem = useCallback(
    (note: NotionNote, index: number) => {
      const items = note.items.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item,
      );
      setNotes((current) => current.map((n) => (n.id === note.id ? { ...n, items } : n)));
      void saveUpdate(note.id, { ...noteToInput(note), items });
    },
    [saveUpdate],
  );

  const handleTogglePin = useCallback(
    async (note: NotionNote) => {
      const pinned = !note.pinned;
      setNotes((current) => current.map((n) => (n.id === note.id ? { ...n, pinned } : n)));
      pendingByNote.current.set(note.id, (pendingByNote.current.get(note.id) || 0) + 1);
      setSaving((c) => c + 1);
      const res = await window.electronAPI.notionNotes.setPinned(serviceId, note.id, pinned);
      setSaving((c) => c - 1);
      if (res.ok) {
        applyServerNote(note.id, res.note);
      } else {
        applyServerNote(note.id, undefined);
        setError(res.error || "Failed to update the note.");
        void loadNotes();
      }
    },
    [serviceId, applyServerNote, loadNotes],
  );

  const handleModalSave = useCallback(
    (note: NotionNote, input: NotionNoteInput) => {
      const optimistic: NotionNote = {
        ...note,
        title: input.title,
        kind: input.kind,
        text: input.text,
        items: input.items,
        pinned: input.pinned,
        imageUrl:
          input.image?.action === "upload"
            ? `data:${input.image.mimeType};base64,${input.image.base64}`
            : input.image?.action === "keep"
              ? note.imageUrl
              : undefined,
      };
      setNotes((current) => current.map((n) => (n.id === note.id ? optimistic : n)));
      void saveUpdate(note.id, input);
    },
    [saveUpdate],
  );

  const handleDelete = useCallback(
    async (noteId: string) => {
      setEditingId(null);
      setNotes((current) => current.filter((n) => n.id !== noteId));
      const res = await window.electronAPI.notionNotes.remove(serviceId, noteId);
      if (!res.ok) {
        setError(res.error || "Failed to delete the note.");
        void loadNotes();
      }
    },
    [serviceId, loadNotes],
  );

  const handleDisconnect = useCallback(async () => {
    setMenuOpen(false);
    await window.electronAPI.notionNotes.disconnect(serviceId);
    notesCache.delete(serviceId);
    setNotes([]);
    setEditingId(null);
    setState("none");
  }, [serviceId]);

  if (state === "loading") {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: "var(--surface)", color: "var(--text-muted)", fontSize: 14 }}
      >
        Loading…
      </div>
    );
  }

  if (state !== "ready") {
    return (
      <NotionSetup
        serviceId={serviceId}
        initialNeedsReset={state === "pending" || state === "pending-adoptable"}
        initialAdoptable={state === "pending-adoptable"}
        onReady={() => setState("ready")}
      />
    );
  }

  const sorted = [...notes].sort((a, b) => b.editedAt.localeCompare(a.editedAt));
  const pinnedNotes = sorted.filter((n) => n.pinned);
  const otherNotes = sorted.filter((n) => !n.pinned);
  const editingNote = editingId ? notes.find((n) => n.id === editingId) ?? null : null;

  const renderSection = (label: string | null, sectionNotes: NotionNote[]) => {
    if (sectionNotes.length === 0) return null;
    return (
      <div style={{ marginTop: 28 }}>
        {label && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.8,
              color: "var(--text-muted)",
              margin: "0 0 8px 8px",
            }}
          >
            {label}
          </div>
        )}
        <div style={{ columnWidth: 240, columnGap: 12 }}>
          {sectionNotes.map((note) => (
            <div key={note.id} style={{ breakInside: "avoid", marginBottom: 12 }}>
              <NoteCard
                note={note}
                onOpen={() => setEditingId(note.id)}
                onToggleItem={(index) => handleToggleItem(note, index)}
                onTogglePin={() => void handleTogglePin(note)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "16px 24px 80px" }}>
        {/* Status + page controls */}
        <div className="flex items-center justify-end" style={{ gap: 4, marginBottom: 8 }}>
          {saving > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 6 }}>Saving…</span>
          )}
          <button
            onClick={() => void loadNotes()}
            title="Refresh notes"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-sidebar-hover cursor-pointer"
            style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
          >
            <MdRefresh size={16} className={notesLoading ? "animate-spin" : ""} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Note taker settings"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-sidebar-hover cursor-pointer"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
            >
              <MdOutlineSettings size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onMouseDown={() => setMenuOpen(false)} />
                <div
                  className="absolute right-0 z-20 rounded-lg"
                  style={{
                    top: 34,
                    minWidth: 210,
                    padding: "4px 0",
                    background: "var(--context-bg)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  <button
                    onClick={() => void handleDisconnect()}
                    className="block w-full text-left cursor-pointer hover:bg-sidebar-hover"
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      background: "transparent",
                      border: "none",
                    }}
                  >
                    Disconnect Notion database
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <NoteComposer onCreate={(input) => void handleCreate(input)} />

        {error && (
          <div
            className="flex items-center rounded-xl"
            style={{
              maxWidth: 600,
              margin: "16px auto 0",
              padding: "10px 16px",
              gap: 12,
              fontSize: 13,
              color: "#f38ba8",
              border: "1px solid color-mix(in srgb, #f38ba8 40%, transparent)",
              background: "color-mix(in srgb, #f38ba8 8%, transparent)",
            }}
          >
            <span className="flex-1" style={{ lineHeight: 1.5 }}>{error}</span>
            <button
              onClick={() => void loadNotes()}
              className="cursor-pointer text-xs font-semibold"
              style={{ color: "var(--text-primary)", background: "transparent", border: "none" }}
            >
              Retry
            </button>
          </div>
        )}

        {notesLoading && notes.length === 0 && !error && (
          <div style={{ textAlign: "center", marginTop: 64, color: "var(--text-muted)", fontSize: 14 }}>
            Loading notes…
          </div>
        )}

        {!notesLoading && notes.length === 0 && !error && (
          <div style={{ textAlign: "center", marginTop: 64, color: "var(--text-muted)", fontSize: 14 }}>
            Notes you add appear here
          </div>
        )}

        {renderSection(pinnedNotes.length > 0 ? "PINNED" : null, pinnedNotes)}
        {renderSection(pinnedNotes.length > 0 ? "OTHERS" : null, otherNotes)}
      </div>

      {editingNote && (
        <NoteModal
          key={editingNote.id}
          note={editingNote}
          onSave={(input) => handleModalSave(editingNote, input)}
          onDelete={() => void handleDelete(editingNote.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
