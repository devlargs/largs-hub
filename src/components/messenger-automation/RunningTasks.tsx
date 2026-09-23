import { IoStopCircleOutline } from "react-icons/io5";
import type { AutomationTask } from "../../types";
import { TASK_LABELS, formatCountdown, resultLabel, taskPreview } from "../../lib/automationForm";
import { labelStyle } from "./styles";

interface RunningTasksProps {
  serviceId: string;
  tasks: AutomationTask[];
  now: number;
}

// This service's scheduled and looping tasks, each with its countdown and a stop button.
export default function RunningTasks({ serviceId, tasks, now }: RunningTasksProps) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="text-xs font-semibold" style={labelStyle}>
          Running tasks
        </span>
        {tasks.length >= 2 && (
          <button
            onClick={() => window.electronAPI.messengerAutomation.stopAll(serviceId)}
            className="text-xs rounded hover:bg-sidebar-hover transition-colors"
            style={{ padding: "2px 8px", color: "#f38ba8" }}
          >
            Stop all
          </button>
        )}
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} now={now} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, now }: { task: AutomationTask; now: number }) {
  const failure = resultLabel(task.lastResult);
  return (
    <div
      className="flex items-center rounded-lg"
      style={{
        gap: 8,
        padding: "8px 10px",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            {TASK_LABELS[task.spec.type]}
          </span>
          {task.fireCount > 0 && (
            <span className="text-xs" style={labelStyle}>
              ×{task.fireCount}
            </span>
          )}
        </div>
        <span className="text-xs truncate" style={labelStyle}>
          {taskPreview(task.spec)}
        </span>
        {failure && (
          <span className="text-xs" style={{ color: "#f9e2af" }}>
            {failure}
          </span>
        )}
      </div>
      {task.nextFireAt !== null && (
        <span
          className="text-xs tabular-nums shrink-0"
          style={{ color: "var(--accent)" }}
          aria-label="Next fire"
          title="Next fire"
        >
          {formatCountdown(task.nextFireAt - now)}
        </span>
      )}
      <button
        onClick={() => window.electronAPI.messengerAutomation.stop(task.id)}
        className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors shrink-0"
        style={{ width: 24, height: 24, color: "#f38ba8" }}
        aria-label="Stop"
        title="Stop"
      >
        <IoStopCircleOutline size={16} />
      </button>
    </div>
  );
}
