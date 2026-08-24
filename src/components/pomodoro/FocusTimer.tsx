import { useEffect, useState } from "react";
import { MdPause, MdPlayArrow, MdSkipNext, MdStop } from "react-icons/md";
import { PomodoroTimerState } from "../../types";

interface FocusTimerProps {
  // null when nothing is running — the hero keeps its shape and shows the
  // idle face rather than collapsing, so the page always reads as a timer
  timer: PomodoroTimerState | null;
  // Text of the task being focused on, when it belongs to the day on screen
  taskText: string | null;
  // Focus sessions banked against this day's tasks — real data, not a guess
  sessionsToday: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

// Phase lengths, mirrored from electron/pomodoroTimer.ts, so the ring can show
// how much of the phase is left without the main process pushing every second.
const PHASE_MS = { focus: 25 * 60_000, break: 5 * 60_000 } as const;

// The SVG's coordinate space. The rendered size comes from CSS (--pom-ring),
// so a short window can shrink the ring without touching this maths.
const RING_SIZE = 168;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// One control button, shared by every state so they can't drift apart.
function ControlButton({
  onClick,
  label,
  children,
  tone = "muted",
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  tone?: "muted" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
      style={{
        width: 34,
        height: 34,
        color: tone === "danger" ? "var(--danger)" : "var(--text-muted)",
        background: "transparent",
        border: "none",
        transition: "color var(--dur-micro) var(--ease-out)",
      }}
    >
      {children}
    </button>
  );
}

export default function FocusTimer({
  timer,
  taskText,
  sessionsToday,
  onStart,
  onPause,
  onResume,
  onSkip,
  onStop,
}: FocusTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const running = timer?.running === true;

  // The main process only pushes on phase changes; tick the display here.
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, timer?.endsAt]);

  const remaining = timer
    ? running
      ? Math.max(0, timer.endsAt - now)
      : timer.remainingMs
    : PHASE_MS.focus;
  const total = timer ? PHASE_MS[timer.phase] : PHASE_MS.focus;
  const elapsed = timer ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
  const accent = timer?.phase === "break" ? "var(--success)" : "var(--accent)";

  return (
    <section className="pom-stage pom-hero rounded-2xl flex flex-col items-center">
      {/* The figure. Stat-Led: the number is the largest thing on the page. */}
      <div className="pom-ring-box relative">
        <svg
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="pom-ring"
          style={{ transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="color-mix(in srgb, var(--border) 70%, transparent)"
            strokeWidth={RING_STROKE}
          />
          {timer && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={accent}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - elapsed)}
              className="pom-ring-progress"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`pom-figure pom-clock ${timer ? "" : "pom-clock-idle"}`}
            style={{ color: timer ? "var(--text-primary)" : undefined }}
            aria-label={
              timer
                ? `${formatClock(remaining)} left in this ${timer.phase} session`
                : "Timer ready"
            }
          >
            {formatClock(remaining)}
          </span>
        </div>
      </div>

      {/* The words that complete the figure — a bare number is never the head. */}
      <span
        className="pom-phase"
        style={{
          marginTop: "var(--space-md)",
          color: timer ? accent : "var(--text-secondary)",
        }}
      >
        {timer ? (timer.phase === "focus" ? "Focus" : "Break") : "Ready"}
      </span>

      <p
        className="text-center"
        style={{
          marginTop: "var(--space-2xs)",
          maxWidth: "36ch",
          fontSize: "var(--text-md)",
          lineHeight: 1.5,
          color: "var(--text-secondary)",
        }}
      >
        {timer
          ? (taskText ?? "A session with no task attached")
          : "Start a session on the next unfinished task."}
      </p>

      {/* Controls */}
      <div
        className="flex items-center"
        style={{ gap: "var(--space-xs)", marginTop: "var(--space-md)" }}
      >
        {timer ? (
          <>
            <ControlButton
              onClick={running ? onPause : onResume}
              label={running ? "Pause" : "Resume"}
            >
              {running ? <MdPause size={20} /> : <MdPlayArrow size={20} />}
            </ControlButton>
            <ControlButton
              onClick={onSkip}
              label={timer.phase === "focus" ? "Skip to the break" : "Skip to the next session"}
            >
              <MdSkipNext size={20} />
            </ControlButton>
            <ControlButton onClick={onStop} label="Stop the timer" tone="danger">
              <MdStop size={20} />
            </ControlButton>
          </>
        ) : (
          <button
            onClick={onStart}
            className="rounded-full cursor-pointer"
            style={{
              padding: "var(--space-xs) var(--space-lg)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: "var(--surface)",
              background: "var(--accent)",
              border: "none",
            }}
          >
            Start focus
          </button>
        )}
      </div>

      {/* Supporting figure — the day's banked sessions, drawn not emoji'd */}
      {(sessionsToday > 0 || (timer?.completedFocus ?? 0) > 0) && (
        <div
          className="flex items-center pom-rule w-full justify-center"
          style={{
            gap: "var(--space-xs)",
            marginTop: "var(--space-lg)",
            paddingTop: "var(--space-sm)",
          }}
        >
          <span
            className="pom-figure"
            style={{ fontSize: "var(--text-lg)", color: "var(--text-primary)" }}
          >
            {sessionsToday}
          </span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
            {sessionsToday === 1 ? "session today" : "sessions today"}
          </span>
        </div>
      )}
    </section>
  );
}
