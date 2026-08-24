import { useEffect, useMemo, useRef, useState } from "react";
import { MdDragIndicator, MdOutlineDeleteOutline, MdTimer, MdTimerOff } from "react-icons/md";
import { PomodoroTask } from "../../types";
import { parseTaskSegments } from "./links";

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

// Completed focus sessions, drawn as bars rather than an emoji — the tomato
// glyph was OS-rendered and never part of the page's type system.
function SessionTally({ count }: { count: number }) {
  const shown = Math.min(count, 4);
  return (
    <span
      className="shrink-0 flex items-center"
      style={{ gap: 2 }}
      title={`${count} focus session${count === 1 ? "" : "s"}`}
      aria-label={`${count} focus session${count === 1 ? "" : "s"}`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="pom-tally-bar" />
      ))}
      {count > shown && (
        <span
          className="pom-figure"
          style={{ fontSize: "var(--text-3xs)", color: "var(--text-secondary)", marginLeft: 2 }}
        >
          +{count - shown}
        </span>
      )}
    </span>
  );
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

  const actionStyle = {
    width: 28,
    height: 28,
    background: "transparent",
    border: "none",
  } as const;

  const labelStyle = {
    fontSize: "var(--text-md)",
    lineHeight: 1.45,
    color: task.done ? "var(--text-muted)" : "var(--text-primary)",
    background: "transparent",
    border: "none",
    padding: 0,
  } as const;

  // Recomputed only when the text changes — every row renders on any list update
  const segments = useMemo(() => parseTaskSegments(task.text), [task.text]);

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
      onAnimationEnd={() => setSpringing(false)}
      className={[
        "pom-row flex items-center",
        task.done ? "pom-row-done" : "",
        focused ? "pom-row-focused" : "",
        springing ? "pom-row-springing" : "",
        dragging ? "pom-row-dragging" : "",
        dropTarget ? "pom-row-drop-target" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ gap: "var(--space-sm)", padding: "var(--space-sm) var(--space-sm)" }}
    >
      <span
        className="pom-row-action shrink-0 cursor-grab"
        style={{ color: "var(--text-muted)" }}
        title="Drag to reorder"
      >
        <MdDragIndicator size={16} />
      </span>

      {/* Checkbox — the tick draws itself in */}
      <button
        onClick={() => {
          setSpringing(true);
          onToggle();
        }}
        className={`pom-check shrink-0 flex items-center justify-center rounded-md cursor-pointer ${
          task.done ? "pom-check-on" : ""
        }`}
        style={{
          width: 19,
          height: 19,
          background: task.done ? "var(--accent)" : "transparent",
          border: `1.5px solid ${
            task.done ? "var(--accent)" : "color-mix(in srgb, var(--border) 90%, transparent)"
          }`,
        }}
        title={task.done ? "Mark as not done" : "Mark as done"}
        aria-pressed={task.done}
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
              padding: "var(--space-3xs) var(--space-2xs)",
              fontSize: "var(--text-md)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent)",
            }}
          />
        ) : segments.length === 1 && segments[0].type === "text" ? (
          // No links — one button for the whole label keeps this the simple,
          // single-tab-stop case that most tasks are.
          <button
            onClick={() => setEditing(true)}
            className={`pom-label cursor-text text-left ${task.done ? "pom-label-done" : ""}`}
            style={labelStyle}
            title="Click to edit"
          >
            {task.text}
          </button>
        ) : (
          // The label carries a link. Each run becomes its own button — text
          // runs open the editor, links open the browser — so a link is never
          // nested inside another interactive element (issue #66).
          <span className={`pom-label ${task.done ? "pom-label-done" : ""}`} style={labelStyle}>
            {segments.map((segment, i) =>
              segment.type === "link" ? (
                <button
                  key={i}
                  onClick={() => window.electronAPI.openLinkExternal(segment.href)}
                  className="pom-link cursor-pointer"
                  title={`Open ${segment.href}`}
                >
                  {segment.value}
                </button>
              ) : (
                <button
                  key={i}
                  onClick={() => setEditing(true)}
                  className="pom-label-text cursor-text text-left"
                  title="Click to edit"
                >
                  {segment.value}
                </button>
              ),
            )}
          </span>
        )}
      </div>

      {task.focusSessions > 0 && <SessionTally count={task.focusSessions} />}

      <button
        onClick={onFocus}
        className={`shrink-0 flex items-center justify-center rounded-md cursor-pointer hover:bg-sidebar-hover ${
          focused ? "" : "pom-row-action"
        }`}
        style={{ ...actionStyle, color: focused ? "var(--accent)" : "var(--text-muted)" }}
        title={focused ? "Stop the focus timer" : "Start a focus session on this task"}
      >
        {focused ? <MdTimerOff size={16} /> : <MdTimer size={16} />}
      </button>

      <button
        onClick={onDelete}
        className="pom-row-action shrink-0 flex items-center justify-center rounded-md cursor-pointer hover:bg-sidebar-hover"
        style={{ ...actionStyle, color: "var(--danger)" }}
        title="Delete task"
      >
        <MdOutlineDeleteOutline size={16} />
      </button>
    </div>
  );
}
