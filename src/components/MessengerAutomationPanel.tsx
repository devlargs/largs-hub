import { useCallback, useEffect, useMemo, useState } from "react";
import { AutoStopState, AutomationTask, MessageListGroup, NoticeReason, TaskSpec } from "../types";
import MessageListPicker from "./MessageListPicker";
import { IoClose, IoStopCircleOutline } from "react-icons/io5";
import { TITLEBAR_HEIGHT } from "@shared/layout";
import { useModalDismiss } from "../hooks/useModalDismiss";

interface MessengerAutomationPanelProps {
  serviceId: string;
  tasks: AutomationTask[];
  onClose: () => void;
}

// The panel takes the right share of a split with the service view. Main owns
// that calculation (electron/automationLayout.ts) and pushes the width here, so
// the panel always covers exactly the strip main reserved for it — no formula
// duplicated across the two layers. The panel starts below the titlebar, whose
// height comes from the shared layout module.
// Used only for the first paint, before main's width arrives.
const FALLBACK_PANEL_WIDTH = 340;
// Below this the two-column rows are cramped, so they stack instead.
const NARROW_PANEL_WIDTH = 340;

type TaskType = TaskSpec["type"];

const FUNCTION_TABS: Array<{ type: TaskType; label: string }> = [
  { type: "sendChatMessage", label: "Send now" },
  { type: "sendChat", label: "Schedule" },
  { type: "sendChatInterval", label: "Interval" },
  { type: "sendEmoji", label: "Emoji" },
  { type: "startCallCycle", label: "Call cycle" },
  { type: "sendRandomFromList", label: "Random list" },
];

const TASK_LABELS: Record<TaskType, string> = {
  sendChatMessage: "Send now",
  sendChat: "Scheduled message",
  sendChatInterval: "Interval messages",
  sendEmoji: "Emoji bursts",
  startCallCycle: "Call cycle",
  sendRandomFromList: "Random list",
};

const RESULT_LABELS: Record<string, string> = {
  "no-input": "Chat input not found — open a conversation",
  "no-send-button": "Send button not found",
  "no-call-button": "Call button not found",
  error: "Could not run in the page",
};

const NOTICE_LABELS: Record<NoticeReason, string> = {
  replied: "they replied",
  seen: "your message was seen",
  typing: "they started typing",
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
      return `every ${spec.fromSec}-${spec.toSec}s · ring ${spec.ringSeconds}s`;
    case "sendRandomFromList":
      return `${spec.name} · ${spec.messages.length} messages`;
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
  const [panelWidth, setPanelWidth] = useState(FALLBACK_PANEL_WIDTH);
  const [selectedType, setSelectedType] = useState<TaskType>("sendChatMessage");
  const [message, setMessage] = useState("");
  const [time, setTime] = useState("00:00");
  const [fromSec, setFromSec] = useState("30");
  const [toSec, setToSec] = useState("120");
  const [emoji, setEmoji] = useState("❤️");
  const [maxLength, setMaxLength] = useState("5");
  const [ringSeconds, setRingSeconds] = useState("30");
  // The list chosen in the "Random list" tab, resolved to its messages on start.
  const [listGroup, setListGroup] = useState<MessageListGroup | null>(null);
  // Emojis previously used to start a burst, newest first (main process state).
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Auto-stop: clears every task for this service once the countdown expires.
  const [autoStop, setAutoStop] = useState<AutoStopState | null>(null);
  const [autoStopMinutes, setAutoStopMinutes] = useState("30");
  const [autoStopError, setAutoStopError] = useState<string | null>(null);

  const serviceTasks = useMemo(
    () => tasks.filter((t) => t.serviceId === serviceId),
    [tasks, serviceId],
  );

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Follow the width main reserved for us: read it on mount, then track the
  // pushes it sends on every window resize. A width of 0 means the split isn't
  // open yet, so keep the fallback rather than collapsing to nothing.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.messengerAutomation.getSplitWidth().then((width) => {
      if (!cancelled && width > 0) setPanelWidth(width);
    });
    const unsubscribe = window.electronAPI?.messengerAutomation.onSplitWidthChanged((width) => {
      if (width > 0) setPanelWidth(width);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  // Escape closes, Tab stays inside, focus returns to the trigger (issue #88).
  const panelRef = useModalDismiss<HTMLDivElement>({ onDismiss: handleClose });

  // The call cycle cancels itself once she reacts; the task is gone from the
  // list by then, so surface the reason here.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.messengerAutomation.onNotice(
      ({ serviceId: id, reason }) => {
        if (id !== serviceId) return;
        setError(null);
        setFeedback(`Call cycle stopped — ${NOTICE_LABELS[reason]}`);
      },
    );
    return unsubscribe;
  }, [serviceId]);

  // A scheduled send whose moment passed while the app was closed is not
  // restored — say so instead of showing an unexplained empty list (issue #75).
  useEffect(() => {
    const unsubscribe = window.electronAPI?.messengerAutomation.onMissed((missedTasks) => {
      const mine = missedTasks.filter((t) => t.serviceId === serviceId);
      if (mine.length === 0) return;
      setError(null);
      setFeedback(
        mine.length === 1
          ? "A scheduled message was missed while the app was closed"
          : `${mine.length} scheduled messages were missed while the app was closed`,
      );
    });
    return unsubscribe;
  }, [serviceId]);

  // The auto-stop lives in the main process (it must survive this panel being
  // closed), so read the armed state on mount and follow it from there.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.messengerAutomation.getAutoStop(serviceId).then((state) => {
      if (!cancelled) setAutoStop(state);
    });
    const unsubscribe = window.electronAPI?.messengerAutomation.onAutoStopUpdated(
      ({ serviceId: id, autoStop: state, fired }) => {
        if (id !== serviceId) return;
        setAutoStop(state);
        if (fired) {
          setError(null);
          setFeedback("Auto-stop reached — all automations cleared");
        }
      },
    );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [serviceId]);

  // Recent emojis live in the main process so they survive the panel closing
  // and are shared across services.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.messengerAutomation.getRecentEmojis().then((emojis) => {
      if (!cancelled) setRecentEmojis(emojis);
    });
    const unsubscribe =
      window.electronAPI?.messengerAutomation.onRecentEmojisUpdated(setRecentEmojis);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Tick countdowns locally; main only pushes on task-state changes
  const hasCountdown = serviceTasks.some((t) => t.nextFireAt !== null) || autoStop !== null;
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
        return {
          type: "startCallCycle",
          fromSec: num(fromSec),
          toSec: num(toSec),
          ringSeconds: num(ringSeconds),
        };
      case "sendRandomFromList":
        if (!listGroup) return null;
        return {
          type: "sendRandomFromList",
          name: listGroup.name,
          messages: listGroup.messages,
          fromSec: num(fromSec),
          toSec: num(toSec),
        };
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

  const handleArmAutoStop = async () => {
    const minutes = Number(autoStopMinutes);
    setAutoStopError(null);
    const result = await window.electronAPI.messengerAutomation.setAutoStop(serviceId, minutes);
    if (!result.ok) {
      setAutoStopError(result.error ?? "Could not set the auto-stop");
      return;
    }
    setAutoStop(result.autoStop);
  };

  const handleCancelAutoStop = async () => {
    setAutoStopError(null);
    await window.electronAPI.messengerAutomation.setAutoStop(serviceId, null);
    setAutoStop(null);
  };

  const needsMessage =
    selectedType === "sendChatMessage" ||
    selectedType === "sendChat" ||
    selectedType === "sendChatInterval";
  // The call cycle uses the same random min/max delay as the other loops, but
  // its attempts can't be closer together than the ring window allows.
  const needsInterval =
    selectedType === "sendChatInterval" ||
    selectedType === "sendEmoji" ||
    selectedType === "startCallCycle" ||
    selectedType === "sendRandomFromList";
  const intervalMin = selectedType === "startCallCycle" ? 5 : 1;
  const startLabel =
    selectedType === "sendChatMessage"
      ? "Send"
      : selectedType === "sendChat"
        ? "Schedule"
        : "Start";
  const canStart =
    !busy &&
    (!needsMessage || message.trim().length > 0) &&
    (selectedType !== "sendEmoji" || emoji.trim().length > 0) &&
    (selectedType !== "sendRandomFromList" || listGroup !== null);

  // At the narrow end the side-by-side rows stop fitting; stack them instead of
  // squeezing two number inputs into ~130px each.
  const narrow = panelWidth < NARROW_PANEL_WIDTH;
  const rowClass = narrow ? "flex flex-col" : "flex";

  const helperText: Partial<Record<TaskType, string>> = {
    sendChatMessage: "Sends into the conversation currently open in Messenger.",
    sendChat: "Fires at the chosen time — if it already passed today, it fires tomorrow.",
    sendChatInterval: "Repeats the message at a random delay between min and max seconds.",
    sendEmoji: "Sends 1 to max-repeat copies of the emoji at a random delay.",
    sendRandomFromList:
      "Sends a message picked at random from the chosen list, never the same one twice in a row, at a random delay between min and max seconds.",
    startCallCycle:
      "Calls in an in-app popup at a random delay between min and max seconds. If a call isn't answered within “Wait to ring” seconds, the popup is closed and the cycle restarts. When the call is answered it stops and keeps the call open. It also stops on its own as soon as the conversation shows a reply, a “Seen” receipt, or a typing indicator.",
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Messenger automation"
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
          aria-label="Close"

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
            <div className={rowClass} style={{ gap: 8 }}>
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
              <div className="flex flex-col" style={{ gap: 4, width: narrow ? "100%" : 100 }}>
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

          {selectedType === "sendEmoji" && (
            <div className="flex flex-col" style={{ gap: 4 }}>
              <label className="text-xs font-medium" style={labelStyle}>
                Recent
              </label>
              {recentEmojis.length === 0 ? (
                <p className="text-2xs" style={labelStyle}>
                  Emojis you burst show up here, ready to pick again.
                </p>
              ) : (
                <div className="flex flex-wrap" style={{ gap: 4 }}>
                  {recentEmojis.map((option) => {
                    const active = option === emoji;
                    return (
                      <button
                        key={option}
                        onClick={() => setEmoji(option)}
                        className="text-sm rounded-lg transition-colors"
                        style={{
                          padding: "4px 8px",
                          lineHeight: 1.2,
                          backgroundColor: active ? "var(--sidebar-active)" : "var(--surface)",
                          border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        }}
                        aria-label={`Burst ${option}`}
                        title={`Burst ${option}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {needsInterval && (
            <div className={rowClass} style={{ gap: 8 }}>
              <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                <label className="text-xs font-medium" style={labelStyle}>
                  Min seconds
                </label>
                <input
                  type="number"
                  min={intervalMin}
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
                  min={intervalMin}
                  value={toSec}
                  onChange={(e) => setToSec(e.target.value)}
                  className="text-sm outline-none rounded-lg"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {selectedType === "sendRandomFromList" && (
            <MessageListPicker selectedId={listGroup?.id ?? null} onSelect={setListGroup} />
          )}

          {selectedType === "startCallCycle" && (
            <div className="flex" style={{ gap: 8 }}>
              <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                <label className="text-xs font-medium" style={labelStyle}>
                  Wait to ring (s)
                </label>
                <input
                  type="number"
                  min={5}
                  value={ringSeconds}
                  onChange={(e) => setRingSeconds(e.target.value)}
                  className="text-sm outline-none rounded-lg"
                  style={inputStyle}
                  aria-label="How long to wait before closing the call popup and restarting the cycle"

                  title="How long to wait before closing the call popup and restarting the cycle"
                />
              </div>
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

        {/* Auto-stop — clears every task for this service after a delay */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <span className="text-xs font-semibold" style={labelStyle}>
            Auto-stop
          </span>
          <p className="text-xs" style={{ ...labelStyle, marginTop: 4 }}>
            Clears every automation for this service once the timer runs out. It keeps counting
            while this panel is closed.
          </p>
          {autoStop ? (
            <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
              <span className="text-xs flex-1" style={labelStyle}>
                Clearing in{" "}
                <span className="tabular-nums" style={{ color: "var(--accent)" }}>
                  {formatCountdown(autoStop.expiresAt - now)}
                </span>
              </span>
              <button
                onClick={handleCancelAutoStop}
                className="text-xs rounded hover:bg-sidebar-hover transition-colors"
                style={{ padding: "4px 10px", color: "#f38ba8" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-end" style={{ gap: 8, marginTop: 8 }}>
              <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                <label className="text-xs font-medium" style={labelStyle}>
                  Clear after (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={autoStopMinutes}
                  onChange={(e) => setAutoStopMinutes(e.target.value)}
                  className="text-sm outline-none rounded-lg w-full"
                  style={inputStyle}
                />
              </div>
              <button
                onClick={handleArmAutoStop}
                className="text-sm font-medium rounded-lg transition-colors shrink-0"
                style={{
                  padding: "8px 14px",
                  backgroundColor: "var(--surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                Set
              </button>
            </div>
          )}
          {autoStopError && (
            <p className="text-xs" style={{ color: "#f38ba8", marginTop: 6 }}>
              {autoStopError}
            </p>
          )}
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
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
