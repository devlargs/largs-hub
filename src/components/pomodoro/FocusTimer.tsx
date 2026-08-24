import { useEffect, useState } from "react";
import { MdPause, MdPlayArrow, MdSkipNext, MdStop } from "react-icons/md";
import { PomodoroTimerState } from "../../types";

interface FocusTimerProps {
  timer: PomodoroTimerState;
  // Text of the task being focused on, if it belongs to the day on screen
  taskText: string | null;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

// Phase lengths, mirrored from electron/pomodoroTimer.ts, so the ring can show
// how much of the phase is left without the main process pushing every second.
const PHASE_MS = { focus: 25 * 60_000, break: 5 * 60_000 } as const;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function FocusTimer({
  timer,
  taskText,
  onPause,
  onResume,
  onSkip,
  onStop,
}: FocusTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  // The main process only pushes on phase changes; tick the display here.
  useEffect(() => {
    if (!timer.running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer.running, timer.endsAt]);

  const remaining = timer.running ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
  const total = PHASE_MS[timer.phase];
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));

  const size = 44;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const accent = timer.phase === "focus" ? "var(--accent)" : "#a6e3a1";

  const buttonStyle = {
    width: 28,
    height: 28,
    color: "var(--text-muted)",
    background: "transparent",
    border: "none",
  } as const;

  return (
    <div
      className="flex items-center rounded-2xl"
      style={{
        gap: 12,
        padding: "10px 14px",
        marginBottom: 12,
        background: "var(--panel)",
        border: `1px solid ${accent}`,
      }}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center tabular-nums"
          style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}
        >
          {formatClock(remaining)}
        </span>
      </div>

      <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: accent }}>
          {timer.phase === "focus" ? "Focus" : "Break"}
          {timer.completedFocus > 0 && (
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
              {" "}
              · {timer.completedFocus} done
            </span>
          )}
        </span>
        <span className="truncate" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {taskText ?? "Focus session"}
        </span>
      </div>

      <button
        onClick={timer.running ? onPause : onResume}
        className="shrink-0 flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
        style={buttonStyle}
        title={timer.running ? "Pause" : "Resume"}
      >
        {timer.running ? <MdPause size={18} /> : <MdPlayArrow size={18} />}
      </button>
      <button
        onClick={onSkip}
        className="shrink-0 flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
        style={buttonStyle}
        title={timer.phase === "focus" ? "Skip to the break" : "Skip to the next focus session"}
      >
        <MdSkipNext size={18} />
      </button>
      <button
        onClick={onStop}
        className="shrink-0 flex items-center justify-center rounded-full cursor-pointer hover:bg-sidebar-hover"
        style={{ ...buttonStyle, color: "#f38ba8" }}
        title="Stop the timer"
      >
        <MdStop size={18} />
      </button>
    </div>
  );
}
