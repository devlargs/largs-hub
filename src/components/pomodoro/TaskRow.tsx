import { useEffect, useRef, useState } from "react";
import { MdDragIndicator, MdOutlineDeleteOutline, MdTimer, MdTimerOff } from "react-icons/md";
import { PomodoroTask } from "../../types";

interface TaskRowProps {
  task: PomodoroTask;
  // The focus timer is currently running against this task
  focused: boolean;
  onToggle: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
  onFocus: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  dropTarget: boolean;
}

export default function TaskRow({
  task,
  focused,
  onToggle,
  onRename,
  onDelete,
  onFocus,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging,
  dropTarget,
}: TaskRowProps) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  // Runs the one-shot spring class; cleared on animation end so a later toggle
  // can retrigger it.
  const [springing, setSpringing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(task.text);
  }, [task.text, editing]);

  const commit = () => {
    setEditing(false);
    const text = draft.trim();
    if (text && text !== task.text) onRename(text);
    else setDraft(task.text);
  };

  const handleToggle = () => {
    setSpringing(true);
    onToggle();
  };

  return (
    <div
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onAnimationEnd={() => setSpringing(false)}
      className={[
        "pom-row flex items-center rounded-xl",
        task.done ? "pom-row-done" : "",
        springing ? "pom-row-springing" : "",
        dragging ? "pom-row-dragging" : "",
        dropTarget ? "pom-row-drop-target" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        gap: 10,
        padding: "10px 12px",
        marginBottom: 6,
        background: hover || focused ? "var(--sidebar-hover)" : "var(--panel)",
        border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      <span
        className="shrink-0 cursor-grab"
        style={{ color: "var(--text-muted)", opacity: hover ? 0.8 : 0.25 }}
        title="Drag to reorder"
      >
        <MdDragIndicator size={16} />
      </span>

      {/* Checkbox — the tick draws itself in */}
      <button
        onClick={handleToggle}
        className={`pom-check shrink-0 flex items-center justify-center rounded-md cursor-pointer ${
          task.done ? "pom-check-on" : ""
        }`}
        style={{
          width: 20,
          height: 20,
          background: task.done ? "var(--accent)" : "transparent",
          border: `1.5px solid ${task.done ? "var(--accent)" : "var(--border)"}`,
        }}
        title={task.done ? "Mark as not done" : "Mark as done"}
        aria-pressed={task.done}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <path
            className="pom-check-tick"
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="var(--surface)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Label / inline editor */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(task.text);
                setEditing(false);
              }
            }}
            className="w-full outline-none rounded-md"
            style={{
              padding: "2px 6px",
              fontSize: 14,
              background: "var(--surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent)",
            }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className={`pom-label cursor-text ${task.done ? "pom-label-done" : ""}`}
            style={{
              fontSize: 14,
              color: task.done ? "var(--text-muted)" : "var(--text-primary)",
            }}
            title="Click to edit"
          >
            {task.text}
          </span>
        )}
      </div>

      {task.focusSessions > 0 && (
        <span
          className="shrink-0 tabular-nums"
          style={{ fontSize: 11, color: "var(--text-muted)" }}
          title={`${task.focusSessions} focus session${task.focusSessions === 1 ? "" : "s"}`}
        >
          🍅 {task.focusSessions}
        </span>
      )}

      <button
        onClick={onFocus}
        className="shrink-0 flex items-center justify-center rounded-md cursor-pointer hover:bg-sidebar-hover"
        style={{
          width: 26,
          height: 26,
          color: focused ? "var(--accent)" : "var(--text-muted)",
          background: "transparent",
          border: "none",
          opacity: hover || focused ? 1 : 0,
        }}
        title={focused ? "Stop the focus timer" : "Start a focus session on this task"}
      >
        {focused ? <MdTimerOff size={16} /> : <MdTimer size={16} />}
      </button>

      <button
        onClick={onDelete}
        className="shrink-0 flex items-center justify-center rounded-md cursor-pointer hover:bg-sidebar-hover"
        style={{
          width: 26,
          height: 26,
          color: "#f38ba8",
          background: "transparent",
          border: "none",
          opacity: hover ? 1 : 0,
        }}
        title="Delete task"
      >
        <MdOutlineDeleteOutline size={16} />
      </button>
    </div>
  );
}
