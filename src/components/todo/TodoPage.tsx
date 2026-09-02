import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdExpandMore,
  MdOutlineSettings,
  MdRefresh,
} from "react-icons/md";
import { Service, TodoConnectionState, TodoSyncState, TodoTask } from "../../types";
import NotionTaskSetup from "./NotionTaskSetup";
import { dissolveDurationMs } from "./dissolve";
import TaskRow from "./TaskRow";
import { formatDayLabel, formatFullDate, shiftDateKey, todayKey } from "./dates";
import "./todo.css";

interface TodoPageProps {
  service: Service;
}

// Days already pulled from Notion this session, keyed service|date. The page
// unmounts on every service switch, so without this each visit would re-query
// the API; a pull only happens when the cached copy is older than the TTL.
const pullCache = new Map<string, number>();
const CACHE_TTL_MS = 30_000;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const byOrder = (tasks: TodoTask[]): TodoTask[] => [...tasks].sort((a, b) => a.order - b.order);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function TodoPage({ service }: TodoPageProps) {
  const serviceId = service.id;
  const [date, setDate] = useState(todayKey);
  // Direction of the last day change, so the list can slide the right way
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const [connection, setConnection] = useState<"loading" | TodoConnectionState>("loading");
  const [showSetup, setShowSetup] = useState(false);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [sync, setSync] = useState<TodoSyncState | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The connected database's page on notion.so, or null when there's nothing to
  // open (issue #103).
  const [databaseUrl, setDatabaseUrl] = useState<string | null>(null);
  const [enteringIds, setEnteringIds] = useState<string[]>([]);
  // The task whose label is mid-dissolve; it stays in the open list until the
  // letters have gone, so the row doesn't vanish out from under the animation.
  const [dissolvingId, setDissolvingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const composerRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());

  const ordered = useMemo(() => byOrder(tasks), [tasks]);
  const openTasks = useMemo(() => ordered.filter((t) => !t.done), [ordered]);
  const doneTasks = useMemo(() => ordered.filter((t) => t.done), [ordered]);
  const doneCount = doneTasks.length;
  const progress = ordered.length === 0 ? 0 : doneCount / ordered.length;

  // --- loading ---------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.todo.getState(serviceId).then((state) => {
      if (cancelled) return;
      setConnection(state);
      // A half-finished connection has to be resolved before anything else
      if (state === "pending" || state === "pending-adoptable") setShowSetup(true);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  // Re-read on every connection change, so the menu item appears the moment a
  // database is connected and goes with it on disconnect.
  useEffect(() => {
    if (connection === "loading" || connection === "local") {
      setDatabaseUrl(null);
      return;
    }
    let cancelled = false;
    void window.electronAPI.todo.databaseUrl(serviceId).then((url) => {
      if (!cancelled) setDatabaseUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId, connection]);

  const loadDay = useCallback(
    async (targetDate: string) => {
      const res = await window.electronAPI.todo.list(serviceId, targetDate);
      if (res.ok && res.tasks) {
        setTasks(res.tasks);
        if (res.sync) setSync(res.sync);
        // Anything the main process just carried over from an earlier day grows
        // in, so a list that gained tasks on its own explains itself.
        if (res.carried?.length) setEnteringIds(res.carried);
      } else if (res.error) {
        setError(res.error);
      }
    },
    [serviceId],
  );

  const pullDay = useCallback(
    async (targetDate: string) => {
      setRefreshing(true);
      setError(null);
      const res = await window.electronAPI.todo.refresh(serviceId, targetDate);
      setRefreshing(false);
      if (res.ok && res.tasks) {
        setTasks(res.tasks);
        pullCache.set(`${serviceId}|${targetDate}`, Date.now());
      } else if (res.error) {
        setError(res.error);
      }
      if (res.sync) setSync(res.sync);
    },
    [serviceId],
  );

  // Local state renders first; a pull only follows when this day's cached copy
  // has gone stale, so flipping between days (or services) doesn't hammer the
  // Notion API. The Refresh button bypasses the guard.
  useEffect(() => {
    void loadDay(date);
    if (connection !== "ready") return;
    const cached = pullCache.get(`${serviceId}|${date}`);
    if (cached && Date.now() - cached < CACHE_TTL_MS) return;
    void pullDay(date);
  }, [serviceId, date, connection, loadDay, pullDay]);

  // Left open overnight the page would still be showing the old day under the
  // heading "Today". Once the date turns, the view follows it — which is what
  // brings the unfinished tasks across as well (issue #107). Only a view that
  // was sitting on "today" moves; a day you navigated to deliberately stays put.
  const lastTodayRef = useRef(todayKey());
  useEffect(() => {
    const timer = setInterval(() => {
      const today = todayKey();
      const previous = lastTodayRef.current;
      if (today === previous) return;
      lastTodayRef.current = today;
      setDate((current) => {
        if (current !== previous) return current;
        setSlide("next");
        return today;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Pushes from the main process: a background flush that assigned a page id,
  // or a pull that merged remote changes.
  useEffect(() => {
    const unsubTasks = window.electronAPI.todo.onTasksUpdated(({ serviceId: id, tasks: all }) => {
      if (id !== serviceId) return;
      setTasks(all.filter((t) => t.date === date));
    });
    const unsubSync = window.electronAPI.todo.onSyncUpdated((state) => {
      if (state.serviceId === serviceId) setSync(state);
    });
    return () => {
      unsubTasks();
      unsubSync();
    };
  }, [serviceId, date]);

  // The composer is the point of the page, so it holds the caret from the
  // moment the service opens — adding a task never costs a click.
  useEffect(() => {
    if (!showSetup && connection !== "loading") composerRef.current?.focus();
  }, [showSetup, connection]);

  // --- animation helpers -----------------------------------------------------

  // FLIP: rows that moved (a task sinking after being checked, neighbours
  // closing a gap) slide from where they were instead of jumping.
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const seen = new Set<string>();
    for (const [id, el] of rowRefs.current) {
      seen.add(id);
      const next = el.getBoundingClientRect();
      const prev = prevRects.current.get(id);
      if (prev && !reduce && Math.abs(prev.top - next.top) > 1) {
        el.animate(
          [{ transform: `translateY(${prev.top - next.top}px)` }, { transform: "translateY(0)" }],
          { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
      }
      prevRects.current.set(id, next);
    }
    for (const id of [...prevRects.current.keys()]) {
      if (!seen.has(id)) prevRects.current.delete(id);
    }
  }, [openTasks, doneTasks, showDone]);

  // Collapse a row to nothing before it leaves the list, so the gap closes
  // instead of snapping shut.
  const collapseRow = useCallback(async (taskId: string) => {
    const el = rowRefs.current.get(taskId);
    if (!el || prefersReducedMotion()) return;
    const { height } = el.getBoundingClientRect();
    await el
      .animate(
        [
          { height: `${height}px`, opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: 200, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" },
      )
      .finished.catch(() => undefined);
  }, []);

  // --- mutations -------------------------------------------------------------

  const applyResult = useCallback((result: { ok: boolean; error?: string; tasks?: TodoTask[] }) => {
    if (result.ok && result.tasks) setTasks(result.tasks);
    else if (result.error) setError(result.error);
  }, []);

  const handleCreate = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    const res = await window.electronAPI.todo.create(serviceId, date, text);
    if (res.task) setEnteringIds((ids) => [...ids, res.task!.id]);
    applyResult(res);
    composerRef.current?.focus();
  }, [draft, serviceId, date, applyResult]);

  const handleToggle = useCallback(
    async (task: TodoTask) => {
      // The write goes out first — the animation is presentation, and a task
      // must never be lost because a frame was dropped.
      const request = window.electronAPI.todo.update(serviceId, task.id, { done: !task.done });
      // Checking a task dissolves its letters, then closes the gap it leaves.
      // Un-checking is the plain state change: nothing is going away.
      if (!task.done && !prefersReducedMotion()) {
        setDissolvingId(task.id);
        await wait(dissolveDurationMs([...task.text].length));
        await collapseRow(task.id);
        setDissolvingId(null);
      }
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
      applyResult(await request);
    },
    [serviceId, applyResult, collapseRow],
  );

  const handleRename = useCallback(
    async (task: TodoTask, text: string) => {
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, text } : t)));
      applyResult(await window.electronAPI.todo.update(serviceId, task.id, { text }));
    },
    [serviceId, applyResult],
  );

  const handleDelete = useCallback(
    async (task: TodoTask) => {
      const request = window.electronAPI.todo.remove(serviceId, task.id);
      await collapseRow(task.id);
      setTasks((current) => current.filter((t) => t.id !== task.id));
      applyResult(await request);
    },
    [serviceId, applyResult, collapseRow],
  );

  const handleDrop = useCallback(async () => {
    if (!draggingId || !dropTargetId || draggingId === dropTargetId) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }
    // Pull the dragged id out first, then look up the target's index — doing
    // it the other way round is off by one whenever it moves downwards.
    const ids = openTasks.map((t) => t.id);
    const [moved] = ids.splice(ids.indexOf(draggingId), 1);
    ids.splice(ids.indexOf(dropTargetId), 0, moved);
    // Done tasks aren't draggable but still hold positions in the day, so they
    // ride along on the end rather than being dropped from the order.
    ids.push(...doneTasks.map((t) => t.id));
    setDraggingId(null);
    setDropTargetId(null);
    // Reflect the new order locally so the rows settle before the round trip
    setTasks((current) =>
      current.map((t) => ({ ...t, order: ids.indexOf(t.id) === -1 ? t.order : ids.indexOf(t.id) })),
    );
    applyResult(await window.electronAPI.todo.reorder(serviceId, date, ids));
  }, [draggingId, dropTargetId, openTasks, doneTasks, serviceId, date, applyResult]);

  const goToDay = useCallback((next: string, direction: "next" | "prev") => {
    setSlide(direction);
    setDate(next);
    setError(null);
  }, []);

  const handleDisconnect = useCallback(async () => {
    setMenuOpen(false);
    await window.electronAPI.todo.disconnect(serviceId);
    pullCache.clear();
    setConnection("local");
  }, [serviceId]);

  // --- setup screen ----------------------------------------------------------

  if (connection === "loading") {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: "var(--surface)", color: "var(--text-muted)", fontSize: 14 }}
      >
        Loading…
      </div>
    );
  }

  if (showSetup) {
    return (
      <NotionTaskSetup
        serviceId={serviceId}
        initialNeedsReset={connection === "pending" || connection === "pending-adoptable"}
        initialAdoptable={connection === "pending-adoptable"}
        onReady={() => {
          setConnection("ready");
          setShowSetup(false);
          pullCache.clear();
        }}
        onCancel={async () => {
          // Backing out of a half-finished connection drops it — the service
          // falls back to local-only rather than sitting in limbo.
          if (connection !== "ready" && connection !== "local") {
            await window.electronAPI.todo.disconnect(serviceId);
            setConnection("local");
          }
          setShowSetup(false);
        }}
      />
    );
  }

  // --- list ------------------------------------------------------------------

  const chromeButton = {
    width: 30,
    height: 30,
    color: "var(--text-muted)",
    background: "transparent",
    border: "none",
  } as const;

  // Shared by every row of the settings menu, so a second entry can't drift
  // away from the first.
  const menuItem = {
    padding: "var(--space-xs) var(--space-sm)",
    fontSize: "var(--text-sm)",
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
  } as const;

  const syncPill = (() => {
    if (!sync || sync.status === "local") return null;
    const label =
      sync.status === "synced"
        ? "Synced"
        : sync.status === "syncing"
          ? "Syncing"
          : `${sync.pending} pending`;
    return (
      <button
        onClick={() => window.electronAPI.todo.retrySync(serviceId).then(setSync)}
        title={sync.error || (sync.status === "offline" ? "Offline — retry now" : "Notion sync")}
        className={`rounded-full cursor-pointer ${sync.status === "syncing" ? "todo-pill-syncing" : ""}`}
        style={{
          padding: "var(--space-3xs) var(--space-xs)",
          fontSize: "var(--text-2xs)",
          whiteSpace: "nowrap",
          color: sync.status === "offline" ? "var(--warning)" : "var(--text-secondary)",
          background: "transparent",
          border: `1px solid color-mix(in srgb, var(--border) 70%, transparent)`,
        }}
      >
        {label}
      </button>
    );
  })();

  const renderRow = (task: TodoTask, reorderable: boolean) => (
    <div
      key={task.id}
      ref={(el) => {
        if (el) rowRefs.current.set(task.id, el);
        else rowRefs.current.delete(task.id);
      }}
      className={`todo-row-wrap ${enteringIds.includes(task.id) ? "todo-row-entering" : ""}`}
      onAnimationEnd={() => setEnteringIds((ids) => ids.filter((id) => id !== task.id))}
    >
      <TaskRow
        task={task}
        dissolving={dissolvingId === task.id}
        reorderable={reorderable}
        onToggle={() => void handleToggle(task)}
        onRename={(text) => void handleRename(task, text)}
        onDelete={() => void handleDelete(task)}
        onDragStart={() => setDraggingId(task.id)}
        onDragOver={() => setDropTargetId(task.id)}
        onDrop={() => void handleDrop()}
        onDragEnd={() => {
          setDraggingId(null);
          setDropTargetId(null);
        }}
        dragging={draggingId === task.id}
        dropTarget={dropTargetId === task.id && draggingId !== task.id}
      />
    </div>
  );

  return (
    <div className="todo-page h-full flex flex-col" style={{ background: "var(--surface)" }}>
      {/* --- The head. Day, composer, progress — pinned, so adding a task never
          costs a scroll no matter how long the list gets. --- */}
      <div className="todo-head shrink-0">
        <div className="todo-measure">
          <header
            className="flex items-start justify-between flex-wrap"
            style={{ gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}
          >
            <div className="min-w-0">
              <h1 className="todo-day" style={{ color: "var(--text-primary)" }}>
                {formatDayLabel(date)}
              </h1>
              <p
                style={{
                  marginTop: "var(--space-3xs)",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-secondary)",
                }}
              >
                {formatFullDate(date)}
                {ordered.length > 0 && (
                  <>
                    {" · "}
                    <span className="todo-figure">
                      {doneCount}/{ordered.length}
                    </span>{" "}
                    done
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center shrink-0" style={{ gap: "var(--space-3xs)" }}>
              {date !== todayKey() && (
                <button
                  onClick={() => goToDay(todayKey(), date < todayKey() ? "next" : "prev")}
                  className="rounded-full cursor-pointer"
                  style={{
                    padding: "var(--space-3xs) var(--space-xs)",
                    marginRight: "var(--space-2xs)",
                    fontSize: "var(--text-2xs)",
                    whiteSpace: "nowrap",
                    color: "var(--accent)",
                    background: "transparent",
                    border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
                  }}
                >
                  Today
                </button>
              )}
              {syncPill}
              <button
                onClick={() => goToDay(shiftDateKey(date, -1), "prev")}
                className="todo-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
                style={chromeButton}
                title="Previous day"
                aria-label="Previous day"
              >
                <MdChevronLeft size={18} />
              </button>
              <button
                onClick={() => goToDay(shiftDateKey(date, 1), "next")}
                className="todo-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
                style={chromeButton}
                title="Next day"
                aria-label="Next day"
              >
                <MdChevronRight size={18} />
              </button>
              <button
                onClick={() => void pullDay(date)}
                title="Refresh from Notion"
                aria-label="Refresh from Notion"
                disabled={connection !== "ready"}
                className="todo-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
                style={{ ...chromeButton, opacity: connection === "ready" ? 1 : 0.3 }}
              >
                <MdRefresh size={15} className={refreshing ? "animate-spin" : ""} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  title="Todo settings"
                  aria-label="Todo settings"
                  className="todo-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
                  style={chromeButton}
                >
                  <MdOutlineSettings size={15} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onMouseDown={() => setMenuOpen(false)} />
                    <div
                      className="absolute right-0 z-20 rounded-lg"
                      style={{
                        top: 34,
                        minWidth: 230,
                        padding: "4px 0",
                        background: "var(--context-bg)",
                        border: "1px solid var(--border)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                      }}
                    >
                      {databaseUrl && (
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            window.electronAPI.openLinkExternal(databaseUrl);
                          }}
                          className="block w-full text-left cursor-pointer hover:bg-sidebar-hover"
                          style={menuItem}
                        >
                          View database in Notion
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (connection === "ready") void handleDisconnect();
                          else {
                            setMenuOpen(false);
                            setShowSetup(true);
                          }
                        }}
                        className="block w-full text-left cursor-pointer hover:bg-sidebar-hover"
                        style={menuItem}
                      >
                        {connection === "ready"
                          ? "Disconnect Notion database"
                          : "Sync with a Notion database…"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* The composer. First thing under the day, before the list, so a new
              task is always one keystroke away. */}
          <form
            className="todo-composer flex items-center rounded-lg"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <MdAdd size={18} className="shrink-0" style={{ color: "var(--text-muted)" }} />
            <input
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={ordered.length === 0 ? "What needs doing today?" : "Add a task"}
              aria-label="Add a task"
              className="flex-1 min-w-0 outline-none"
              style={{
                fontSize: "var(--text-md)",
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
              }}
            />
            <span
              className="todo-composer-hint shrink-0"
              aria-hidden={draft.trim().length === 0}
              style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}
            >
              Enter
            </span>
          </form>
        </div>

        {/* The head's bottom edge doubles as the day's progress. */}
        <div className="todo-progress-track">
          <div
            className={`todo-progress-fill ${progress === 1 ? "todo-progress-fill-complete" : ""}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* --- The list. Scrolls under the head. --- */}
      <div className="todo-scroll flex-1 overflow-y-auto">
        <div className="todo-measure">
          {error && (
            <div
              className="flex items-center rounded-lg"
              style={{
                padding: "var(--space-xs) var(--space-sm)",
                marginBottom: "var(--space-sm)",
                gap: "var(--space-sm)",
                fontSize: "var(--text-sm)",
                color: "var(--danger)",
                border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
                background: "color-mix(in srgb, var(--danger) 7%, transparent)",
              }}
            >
              <span className="flex-1" style={{ lineHeight: 1.5 }}>
                {error}
              </span>
              <button
                onClick={() => setError(null)}
                className="cursor-pointer shrink-0"
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  color: "var(--text-primary)",
                  background: "transparent",
                  border: "none",
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            key={date}
            className={slide === "next" ? "todo-day-next" : slide === "prev" ? "todo-day-prev" : ""}
          >
            {openTasks.map((task) => renderRow(task, true))}

            {openTasks.length === 0 && (
              <p
                className="todo-empty"
                style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}
              >
                {ordered.length === 0 ? "Nothing on the list." : "Everything's done."}
              </p>
            )}

            {/* Finished work is filed, not crossed out — a struck-through label
                is still a full row of text to read past. */}
            {doneCount > 0 && (
              <>
                <button
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                  className="todo-done-toggle flex items-center w-full cursor-pointer"
                >
                  <MdExpandMore
                    size={17}
                    className={`todo-done-caret shrink-0 ${showDone ? "todo-done-caret-open" : ""}`}
                  />
                  <span>Done tasks</span>
                  <span className="todo-figure todo-done-count">{doneCount}</span>
                </button>
                {showDone && (
                  <div className="todo-done-list">
                    {doneTasks.map((task) => renderRow(task, false))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
