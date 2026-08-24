import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdOutlineSettings,
  MdRefresh,
  MdSubdirectoryArrowRight,
} from "react-icons/md";
import {
  PomodoroConnectionState,
  PomodoroSyncState,
  PomodoroTask,
  PomodoroTimerState,
  Service,
} from "../../types";
import FocusTimer from "./FocusTimer";
import NotionTaskSetup from "./NotionTaskSetup";
import TaskRow from "./TaskRow";
import { formatDayLabel, formatFullDate, shiftDateKey, todayKey } from "./dates";
import "./pomodoro.css";

interface PomodoroPageProps {
  service: Service;
}

// Days already pulled from Notion this session, keyed service|date. The page
// unmounts on every service switch, so without this each visit would re-query
// the API; a pull only happens when the cached copy is older than the TTL.
const pullCache = new Map<string, number>();
const CACHE_TTL_MS = 30_000;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Unfinished first (in manual order), finished sinking to the bottom — the
// reflow between the two groups is what the FLIP animation below smooths over.
function displayOrder(tasks: PomodoroTask[]): PomodoroTask[] {
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order);
}

export default function PomodoroPage({ service }: PomodoroPageProps) {
  const serviceId = service.id;
  const [date, setDate] = useState(todayKey);
  // Direction of the last day change, so the list can slide the right way
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const [connection, setConnection] = useState<"loading" | PomodoroConnectionState>("loading");
  const [showSetup, setShowSetup] = useState(false);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [sync, setSync] = useState<PomodoroSyncState | null>(null);
  const [timer, setTimer] = useState<PomodoroTimerState | null>(null);
  const [carryCount, setCarryCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [enteringIds, setEnteringIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const composerRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  // Tracks the previous "everything is done" state so the flourish only fires
  // on the transition, not on every render of a finished day.
  const wasAllDone = useRef(false);

  const ordered = useMemo(() => displayOrder(tasks), [tasks]);
  const doneCount = ordered.filter((t) => t.done).length;
  const progress = ordered.length === 0 ? 0 : doneCount / ordered.length;
  const sessionsToday = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.focusSessions ?? 0), 0),
    [tasks],
  );

  // --- loading ---------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.pomodoro.getState(serviceId).then((state) => {
      if (cancelled) return;
      setConnection(state);
      // A half-finished connection has to be resolved before anything else
      if (state === "pending" || state === "pending-adoptable") setShowSetup(true);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const loadDay = useCallback(
    async (targetDate: string) => {
      const res = await window.electronAPI.pomodoro.list(serviceId, targetDate);
      if (res.ok && res.tasks) {
        setTasks(res.tasks);
        if (res.sync) setSync(res.sync);
      } else if (res.error) {
        setError(res.error);
      }
      setCarryCount(
        await window.electronAPI.pomodoro.pendingCount(serviceId, shiftDateKey(targetDate, -1)),
      );
    },
    [serviceId],
  );

  const pullDay = useCallback(
    async (targetDate: string) => {
      setRefreshing(true);
      setError(null);
      const res = await window.electronAPI.pomodoro.refresh(serviceId, targetDate);
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

  // Pushes from the main process: a background flush that assigned a page id,
  // or a pull that merged remote changes.
  useEffect(() => {
    const unsubTasks = window.electronAPI.pomodoro.onTasksUpdated(
      ({ serviceId: id, tasks: all }) => {
        if (id !== serviceId) return;
        setTasks(all.filter((t) => t.date === date));
      },
    );
    const unsubSync = window.electronAPI.pomodoro.onSyncUpdated((state) => {
      if (state.serviceId === serviceId) setSync(state);
    });
    return () => {
      unsubTasks();
      unsubSync();
    };
  }, [serviceId, date]);

  useEffect(() => {
    window.electronAPI.pomodoro.timer.get().then(setTimer);
    return window.electronAPI.pomodoro.timer.onUpdated(setTimer);
  }, []);

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
  }, [ordered]);

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

  // The flourish when the last open task of the day is checked
  useEffect(() => {
    const allDone = ordered.length > 0 && doneCount === ordered.length;
    if (allDone && !wasAllDone.current && !prefersReducedMotion()) {
      setCelebrating(true);
      const id = setTimeout(() => setCelebrating(false), 950);
      wasAllDone.current = true;
      return () => clearTimeout(id);
    }
    wasAllDone.current = allDone;
  }, [ordered.length, doneCount]);

  // --- mutations -------------------------------------------------------------

  const applyResult = useCallback(
    (result: { ok: boolean; error?: string; tasks?: PomodoroTask[] }) => {
      if (result.ok && result.tasks) setTasks(result.tasks);
      else if (result.error) setError(result.error);
    },
    [],
  );

  const handleCreate = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    const res = await window.electronAPI.pomodoro.create(serviceId, date, text);
    if (res.task) setEnteringIds((ids) => [...ids, res.task!.id]);
    applyResult(res);
    composerRef.current?.focus();
  }, [draft, serviceId, date, applyResult]);

  const handleToggle = useCallback(
    async (task: PomodoroTask) => {
      // Optimistic: the checkbox must never wait on anything
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
      applyResult(
        await window.electronAPI.pomodoro.update(serviceId, task.id, { done: !task.done }),
      );
    },
    [serviceId, applyResult],
  );

  const handleRename = useCallback(
    async (task: PomodoroTask, text: string) => {
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, text } : t)));
      applyResult(await window.electronAPI.pomodoro.update(serviceId, task.id, { text }));
    },
    [serviceId, applyResult],
  );

  const handleDelete = useCallback(
    async (task: PomodoroTask) => {
      const request = window.electronAPI.pomodoro.remove(serviceId, task.id);
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
    const ids = ordered.map((t) => t.id);
    const [moved] = ids.splice(ids.indexOf(draggingId), 1);
    ids.splice(ids.indexOf(dropTargetId), 0, moved);
    setDraggingId(null);
    setDropTargetId(null);
    // Reflect the new order locally so the rows settle before the round trip
    setTasks((current) =>
      current.map((t) => ({ ...t, order: ids.indexOf(t.id) === -1 ? t.order : ids.indexOf(t.id) })),
    );
    applyResult(await window.electronAPI.pomodoro.reorder(serviceId, date, ids));
  }, [draggingId, dropTargetId, ordered, serviceId, date, applyResult]);

  const handleCarryOver = useCallback(async () => {
    const before = new Set(tasks.map((t) => t.id));
    const res = await window.electronAPI.pomodoro.carryOver(
      serviceId,
      shiftDateKey(date, -1),
      date,
    );
    applyResult(res);
    if (res.ok) {
      // Only the tasks that actually arrived get the grow-in animation
      setEnteringIds((res.tasks ?? []).filter((t) => !before.has(t.id)).map((t) => t.id));
      setCarryCount(0);
    }
  }, [tasks, serviceId, date, applyResult]);

  // Starting from the hero picks up the next unfinished task, so the common
  // case ("just start working") costs one click instead of two.
  const handleStartSession = useCallback(() => {
    const next = ordered.find((t) => !t.done) ?? null;
    void window.electronAPI.pomodoro.timer.start(serviceId, next?.id ?? null).then(setTimer);
  }, [ordered, serviceId]);

  const goToDay = useCallback((next: string, direction: "next" | "prev") => {
    setSlide(direction);
    setDate(next);
    setError(null);
  }, []);

  const handleDisconnect = useCallback(async () => {
    setMenuOpen(false);
    await window.electronAPI.pomodoro.disconnect(serviceId);
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
            await window.electronAPI.pomodoro.disconnect(serviceId);
            setConnection("local");
          }
          setShowSetup(false);
        }}
      />
    );
  }

  // --- list ------------------------------------------------------------------

  const timerTask = timer?.taskId ? tasks.find((t) => t.id === timer.taskId) : null;

  const chromeButton = {
    width: 30,
    height: 30,
    color: "var(--text-muted)",
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
        onClick={() => window.electronAPI.pomodoro.retrySync(serviceId).then(setSync)}
        title={sync.error || (sync.status === "offline" ? "Offline — retry now" : "Notion sync")}
        className={`rounded-full cursor-pointer ${sync.status === "syncing" ? "pom-pill-syncing" : ""}`}
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

  return (
    <div className="pom-page h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        {/* --- Day masthead. Left-flush and the largest text on the page after
            the clock; the chrome sits right at a quieter weight. --- */}
        <header
          className="flex items-start justify-between flex-wrap"
          style={{ gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}
        >
          <div className="min-w-0">
            <h1 className="pom-day" style={{ color: "var(--text-primary)" }}>
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
              className="pom-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
              style={chromeButton}
              title="Previous day"
              aria-label="Previous day"
            >
              <MdChevronLeft size={18} />
            </button>
            <button
              onClick={() => goToDay(shiftDateKey(date, 1), "next")}
              className="pom-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
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
              className="pom-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
              style={{ ...chromeButton, opacity: connection === "ready" ? 1 : 0.3 }}
            >
              <MdRefresh size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                title="Pomodoro settings"
                aria-label="Pomodoro settings"
                className="pom-daynav flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
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
                    <button
                      onClick={() => {
                        if (connection === "ready") void handleDisconnect();
                        else {
                          setMenuOpen(false);
                          setShowSetup(true);
                        }
                      }}
                      className="block w-full text-left cursor-pointer hover:bg-sidebar-hover"
                      style={{
                        padding: "var(--space-xs) var(--space-sm)",
                        fontSize: "var(--text-sm)",
                        color: "var(--text-primary)",
                        background: "transparent",
                        border: "none",
                      }}
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

        {/* --- Progress. The count is a figure, set in mono. --- */}
        <div
          className={celebrating ? "pom-celebrating" : ""}
          style={{ marginBottom: "var(--space-lg)" }}
        >
          <div
            className="flex items-baseline justify-between"
            style={{ gap: "var(--space-sm)", marginBottom: "var(--space-xs)" }}
          >
            <span className="flex items-baseline" style={{ gap: "var(--space-2xs)" }}>
              <span
                className="pom-figure"
                style={{ fontSize: "var(--text-xl)", color: "var(--text-primary)" }}
              >
                {doneCount}
                <span style={{ color: "var(--text-secondary)" }}>/{ordered.length}</span>
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                {ordered.length === 0 ? "nothing planned" : "done"}
              </span>
            </span>
            {celebrating && (
              <span
                className="pom-glow"
                style={{ fontSize: "var(--text-xs)", color: "var(--success)" }}
              >
                Everything's done.
              </span>
            )}
          </div>
          <div className="pom-progress-track">
            <div
              className={`pom-progress-fill ${progress === 1 ? "pom-progress-fill-complete" : ""}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* --- The hero. Present whether or not a session is running. --- */}
        <FocusTimer
          timer={timer}
          taskText={timerTask?.text ?? null}
          sessionsToday={sessionsToday}
          onStart={handleStartSession}
          onPause={() => window.electronAPI.pomodoro.timer.pause().then(setTimer)}
          onResume={() => window.electronAPI.pomodoro.timer.resume().then(setTimer)}
          onSkip={() => window.electronAPI.pomodoro.timer.skip().then(setTimer)}
          onStop={() => window.electronAPI.pomodoro.timer.stop().then(() => setTimer(null))}
        />

        {carryCount > 0 && (
          <button
            onClick={() => void handleCarryOver()}
            className="flex items-center rounded-lg cursor-pointer w-full"
            style={{
              gap: "var(--space-xs)",
              padding: "var(--space-xs) var(--space-sm)",
              marginBottom: "var(--space-sm)",
              fontSize: "var(--text-sm)",
              textAlign: "left",
              whiteSpace: "nowrap",
              color: "var(--accent)",
              background: "transparent",
              border: "1px dashed color-mix(in srgb, var(--accent) 40%, transparent)",
            }}
          >
            <MdSubdirectoryArrowRight size={15} className="shrink-0" />
            <span className="truncate">
              Carry over {carryCount} from {formatDayLabel(shiftDateKey(date, -1)).toLowerCase()}
            </span>
          </button>
        )}

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

        {/* --- The list. Hairline-separated rows, no per-row card. --- */}
        <div
          key={date}
          className={slide === "next" ? "pom-day-next" : slide === "prev" ? "pom-day-prev" : ""}
        >
          {ordered.map((task) => (
            <div
              key={task.id}
              ref={(el) => {
                if (el) rowRefs.current.set(task.id, el);
                else rowRefs.current.delete(task.id);
              }}
              className={enteringIds.includes(task.id) ? "pom-row-entering" : ""}
              onAnimationEnd={() => setEnteringIds((ids) => ids.filter((id) => id !== task.id))}
            >
              <TaskRow
                task={task}
                focused={timer?.taskId === task.id}
                onToggle={() => void handleToggle(task)}
                onRename={(text) => void handleRename(task, text)}
                onDelete={() => void handleDelete(task)}
                onFocus={() => {
                  if (timer?.taskId === task.id) {
                    void window.electronAPI.pomodoro.timer.stop().then(() => setTimer(null));
                  } else {
                    void window.electronAPI.pomodoro.timer.start(serviceId, task.id).then(setTimer);
                  }
                }}
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
          ))}

          {/* The composer is the last line of the list, aligned to the rows
              above it, rather than a separate box floating over them. */}
          <div
            className="flex items-center"
            style={{
              gap: "var(--space-sm)",
              padding: "var(--space-sm)",
              borderTop:
                ordered.length > 0
                  ? "1px solid color-mix(in srgb, var(--border) 45%, transparent)"
                  : "none",
            }}
          >
            <span className="shrink-0" style={{ width: 16 }} />
            <MdAdd size={17} className="shrink-0" style={{ color: "var(--text-muted)" }} />
            <input
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder={ordered.length === 0 ? "What needs doing today?" : "Add a task"}
              className="flex-1 min-w-0 outline-none"
              style={{
                fontSize: "var(--text-md)",
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
