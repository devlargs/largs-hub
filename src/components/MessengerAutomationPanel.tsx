import { useCallback, useEffect, useMemo, useState } from "react";
import { AutomationTask, TaskSpec } from "../types";
import { IoClose, IoStopCircleOutline } from "react-icons/io5";

interface MessengerAutomationPanelProps {
  serviceId: string;
  tasks: AutomationTask[];
  onClose: () => void;
}

// The panel takes the right share of a 70/30 split. Both these constants must
// match the main process (AUTOMATION_SPLIT_RATIO, SIDEBAR_WIDTH, TITLEBAR_HEIGHT
// in main.ts) so the service pane and this panel align exactly.
const AUTOMATION_SPLIT_RATIO = 0.3;
const SIDEBAR_WIDTH = 68;
const TITLEBAR_HEIGHT = 46;

function computePanelWidth(): number {
  return Math.round((window.innerWidth - SIDEBAR_WIDTH) * AUTOMATION_SPLIT_RATIO);
}

type TaskType = TaskSpec["type"];

const FUNCTION_TABS: Array<{ type: TaskType; label: string }> = [
  { type: "sendChatMessage", label: "Send now" },
  { type: "sendChat", label: "Schedule" },
  { type: "sendChatInterval", label: "Interval" },
  { type: "sendEmoji", label: "Emoji" },
  { type: "startCallCycle", label: "Call cycle" },
];

const TASK_LABELS: Record<TaskType, string> = {
  sendChatMessage: "Send now",
  sendChat: "Scheduled message",
  sendChatInterval: "Interval messages",
  sendEmoji: "Emoji bursts",
  startCallCycle: "Call cycle",
};

const RESULT_LABELS: Record<string, string> = {
  "no-input": "Chat input not found — open a conversation",
  "no-send-button": "Send button not found",
  "no-call-button": "Call button not found",
  error: "Could not run in the page",
};

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function taskPreview(spec: TaskSpec): string {
  switch (spec.type) {
    case "sendChat":
    case "sendChatInterval":
    case "sendChatMessage":
      return spec.message;
    case "sendEmoji":
      return `${spec.emoji} ×1-${spec.maxLength}`;
    case "startCallCycle":
      return `every ${spec.waitSeconds}s`;
  }
}

const inputStyle = {
  padding: "8px 12px",
  backgroundColor: "var(--surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
} as const;

const labelStyle = { color: "var(--text-muted)" } as const;

export default function MessengerAutomationPanel({
  serviceId,
  tasks,
  onClose,
}: MessengerAutomationPanelProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(computePanelWidth);
  const [selectedType, setSelectedType] = useState<TaskType>("sendChatMessage");
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("00:00");
  const [fromSec, setFromSec] = useState("30");
  const [toSec, setToSec] = useState("120");
  const [emoji, setEmoji] = useState("❤️");
  const [maxLength, setMaxLength] = useState("5");
  const [waitSeconds, setWaitSeconds] = useState("120");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const serviceTasks = useMemo(
    () => tasks.filter((t) => t.serviceId === serviceId),
    [tasks, serviceId],
  );

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Recompute our share of the split on window resize so we stay aligned with
  // the service pane (the main process resizes it from the same ratio).
  useEffect(() => {
    const onResize = () => setPanelWidth(computePanelWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleClose]);

  // Tick countdowns locally; main only pushes on task-state changes
  const hasCountdown = serviceTasks.some((t) => t.nextFireAt !== null);
  useEffect(() => {
    if (!hasCountdown) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasCountdown]);

  const buildSpec = (): TaskSpec | null => {
    const num = (value: string) => Number(value);
    switch (selectedType) {
      case "sendChatMessage":
        return { type: "sendChatMessage", message };
      case "sendChat":
        return { type: "sendChat", message, time: time.replace(":", "") };
      case "sendChatInterval":
        return { type: "sendChatInterval", message, fromSec: num(fromSec), toSec: num(toSec) };
      case "sendEmoji":
        return {
          type: "sendEmoji",
          emoji,
          fromSec: num(fromSec),
          toSec: num(toSec),
          maxLength: num(maxLength),
        };
      case "startCallCycle":
        return { type: "startCallCycle", waitSeconds: num(waitSeconds) };
    }
  };

  const handleStart = async () => {
    const spec = buildSpec();
    if (!spec) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await window.electronAPI.messengerAutomation.start(serviceId, spec);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
      } else if (spec.type === "sendChatMessage") {
        // "Send now" has no task-list entry, so confirm it here
        setFeedback("Sent!");
        setMessage("");
      } else if (spec.type === "sendChat" || spec.type === "sendChatInterval") {
        // Scheduled/looping tasks show up in the running-tasks list, so no
        // success text is needed — just clear the message field
        setMessage("");
      }
    } finally {
      setBusy(false);
    }
  };

  const needsMessage =
    selectedType === "sendChatMessage" ||
    selectedType === "sendChat" ||
    selectedType === "sendChatInterval";
  const needsInterval = selectedType === "sendChatInterval" || selectedType === "sendEmoji";
  const startLabel =
    selectedType === "sendChatMessage" ? "Send" : selectedType === "sendChat" ? "Schedule" : "Start";
  const canStart =
    !busy &&
    (!needsMessage || message.trim().length > 0) &&
    (selectedType !== "sendEmoji" || emoji.trim().length > 0);

  const helperText: Partial<Record<TaskType, string>> = {
    sendChatMessage: "Sends into the conversation currently open in Messenger.",
    sendChat: "Fires at the chosen time — if it already passed today, it fires tomorrow.",
    sendChatInterval: "Repeats the message at a random delay between min and max seconds.",
    sendEmoji: "Sends 1 to max-repeat copies of the emoji at a random delay.",
    startCallCycle: "Clicks “Start a voice call” every N seconds until stopped.",
  };

  return (
    <div
      className="fixed z-50 transition-opacity duration-150 ease-out flex flex-col"
      style={{
        top: TITLEBAR_HEIGHT,
        right: 0,
        bottom: 0,
        width: panelWidth,
        backgroundColor: "var(--panel)",
        borderLeft: "1px solid var(--border)",
        opacity: visible && !closing ? 1 : 0,
      }}
    >
      {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Messenger automation
          </span>
          <button
            onClick={handleClose}
            className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
            style={{ width: 24, height: 24, color: "var(--text-muted)" }}
            title="Close"
          >
            <IoClose size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1" style={{ padding: 16 }}>
          {/* Function picker */}
          <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 14 }}>
            {FUNCTION_TABS.map((tab) => {
              const active = tab.type === selectedType;
              return (
                <button
                  key={tab.type}
                  onClick={() => {
                    setSelectedType(tab.type);
                    setError(null);
                    setFeedback(null);
                  }}
                  className="text-xs rounded-full transition-colors"
                  style={{
                    padding: "5px 12px",
                    backgroundColor: active ? "var(--accent)" : "var(--surface)",
                    color: active ? "#fff" : "var(--text-muted)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Parameter form */}
          <div className="flex flex-col" style={{ gap: 10 }}>
            <p className="text-xs" style={labelStyle}>
              {helperText[selectedType]}
            </p>

            {needsMessage && (
              <div className="flex flex-col" style={{ gap: 4 }}>
                <label className="text-xs font-medium" style={labelStyle}>
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Type your message…"
                  className="text-sm outline-none rounded-lg resize-none"
                  style={inputStyle}
                />
              </div>
            )}

            {selectedType === "sendChat" && (
              <div className="flex flex-col" style={{ gap: 4 }}>
                <label className="text-xs font-medium" style={labelStyle}>
                  Send at
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="text-sm outline-none rounded-lg"
                  style={inputStyle}
                />
              </div>
            )}

            {selectedType === "sendEmoji" && (
              <div className="flex" style={{ gap: 8 }}>
                <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                  <label className="text-xs font-medium" style={labelStyle}>
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    className="text-sm outline-none rounded-lg"
                    style={inputStyle}
                  />
                </div>
                <div className="flex flex-col" style={{ gap: 4, width: 100 }}>
                  <label className="text-xs font-medium" style={labelStyle}>
                    Max repeat
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxLength}
                    onChange={(e) => setMaxLength(e.target.value)}
                    className="text-sm outline-none rounded-lg"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {needsInterval && (
              <div className="flex" style={{ gap: 8 }}>
                <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                  <label className="text-xs font-medium" style={labelStyle}>
                    Min seconds
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={fromSec}
                    onChange={(e) => setFromSec(e.target.value)}
                    className="text-sm outline-none rounded-lg"
                    style={inputStyle}
                  />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                  <label className="text-xs font-medium" style={labelStyle}>
                    Max seconds
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={toSec}
                    onChange={(e) => setToSec(e.target.value)}
                    className="text-sm outline-none rounded-lg"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {selectedType === "startCallCycle" && (
              <div className="flex flex-col" style={{ gap: 4 }}>
                <label className="text-xs font-medium" style={labelStyle}>
                  Wait seconds
                </label>
                <input
                  type="number"
                  min={5}
                  value={waitSeconds}
                  onChange={(e) => setWaitSeconds(e.target.value)}
                  className="text-sm outline-none rounded-lg"
                  style={inputStyle}
                />
              </div>
            )}

            {error && (
              <p className="text-xs" style={{ color: "#f38ba8" }}>
                {error}
              </p>
            )}
            {feedback && !error && (
              <p className="text-xs" style={{ color: "#a6e3a1" }}>
                {feedback}
              </p>
            )}

            <button
              onClick={handleStart}
              disabled={!canStart}
              className="text-sm font-medium rounded-lg transition-colors"
              style={{
                padding: "8px 0",
                backgroundColor: "var(--accent)",
                color: "#fff",
                opacity: canStart ? 1 : 0.5,
                cursor: canStart ? "pointer" : "default",
              }}
            >
              {startLabel}
            </button>
          </div>

          {/* Running tasks */}
          {serviceTasks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span className="text-xs font-semibold" style={labelStyle}>
                  Running tasks
                </span>
                {serviceTasks.length >= 2 && (
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
                {serviceTasks.map((task) => {
                  const resultLabel =
                    task.lastResult && RESULT_LABELS[task.lastResult]
                      ? RESULT_LABELS[task.lastResult]
                      : null;
                  return (
                    <div
                      key={task.id}
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
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
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
                        {resultLabel && (
                          <span className="text-xs" style={{ color: "#f9e2af" }}>
                            {resultLabel}
                          </span>
                        )}
                      </div>
                      {task.nextFireAt !== null && (
                        <span
                          className="text-xs tabular-nums shrink-0"
                          style={{ color: "var(--accent)" }}
                          title="Next fire"
                        >
                          {formatCountdown(task.nextFireAt - now)}
                        </span>
                      )}
                      <button
                        onClick={() => window.electronAPI.messengerAutomation.stop(task.id)}
                        className="flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors shrink-0"
                        style={{ width: 24, height: 24, color: "#f38ba8" }}
                        title="Stop"
                      >
                        <IoStopCircleOutline size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
