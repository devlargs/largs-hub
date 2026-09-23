import { useCallback, useEffect, useMemo, useState } from "react";
import { AutomationTask } from "../types";
import { IoClose } from "react-icons/io5";
import { TITLEBAR_HEIGHT } from "@shared/layout";
import { useModalDismiss } from "../hooks/useModalDismiss";
import {
  AutomationForm,
  DEFAULT_AUTO_STOP_MINUTES,
  DEFAULT_FORM,
  FUNCTION_TABS,
  TaskType,
  buildSpec,
} from "../lib/automationForm";
import {
  useAutoStop,
  useAutomationNotices,
  useNow,
  useRecentEmojis,
  useSplitWidth,
} from "./messenger-automation/hooks";
import TaskForm from "./messenger-automation/TaskForm";
import AutoStopSection from "./messenger-automation/AutoStopSection";
import RunningTasks from "./messenger-automation/RunningTasks";
import { usePanelPrefs } from "./messenger-automation/usePanelPrefs";

interface MessengerAutomationPanelProps {
  serviceId: string;
  tasks: AutomationTask[];
  onClose: () => void;
}

// Below this the two-column rows are cramped, so they stack instead.
const NARROW_PANEL_WIDTH = 340;

export default function MessengerAutomationPanel({
  serviceId,
  tasks,
  onClose,
}: MessengerAutomationPanelProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [form, setForm] = useState<AutomationForm>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoStopMinutes, setAutoStopMinutes] = useState(DEFAULT_AUTO_STOP_MINUTES);

  // Opens on the settings last used for this service, and keeps them updated
  usePanelPrefs(serviceId, form, autoStopMinutes, (saved, savedMinutes) => {
    // A message being typed isn't a setting; it stays where it is
    setForm((prev) => ({ ...saved, message: prev.message }));
    setAutoStopMinutes(savedMinutes ?? DEFAULT_AUTO_STOP_MINUTES);
  });

  const serviceTasks = useMemo(
    () => tasks.filter((t) => t.serviceId === serviceId),
    [tasks, serviceId],
  );

  // Success text from main's own pushes replaces any error on screen
  const report = useCallback((text: string) => {
    setError(null);
    setFeedback(text);
  }, []);

  // The panel starts below the titlebar and covers the strip main reserved.
  const panelWidth = useSplitWidth();
  useAutomationNotices(serviceId, report);
  const [autoStop, setAutoStop] = useAutoStop(serviceId, report);
  const recentEmojis = useRecentEmojis();
  const now = useNow(serviceTasks.some((t) => t.nextFireAt !== null) || autoStop !== null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  // Escape closes, Tab stays inside, focus returns to the trigger (issue #88).
  const panelRef = useModalDismiss<HTMLDivElement>({ onDismiss: handleClose });

  const update = useCallback(
    (patch: Partial<AutomationForm>) => setForm((prev) => ({ ...prev, ...patch })),
    [],
  );

  const selectType = (type: TaskType) => {
    update({ type });
    setError(null);
    setFeedback(null);
  };

  const handleStart = async () => {
    const spec = buildSpec(form);
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
        update({ message: "" });
      } else if (spec.type === "sendChat" || spec.type === "sendChatInterval") {
        // Scheduled/looping tasks show up in the running-tasks list, so no
        // success text is needed — just clear the message field
        update({ message: "" });
      }
    } finally {
      setBusy(false);
    }
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
            const active = tab.type === form.type;
            return (
              <button
                key={tab.type}
                onClick={() => selectType(tab.type)}
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

        <TaskForm
          form={form}
          update={update}
          narrow={panelWidth < NARROW_PANEL_WIDTH}
          recentEmojis={recentEmojis}
          error={error}
          feedback={feedback}
          busy={busy}
          onStart={handleStart}
        />

        <AutoStopSection
          serviceId={serviceId}
          autoStop={autoStop}
          onChange={setAutoStop}
          now={now}
          minutes={autoStopMinutes}
          onMinutesChange={setAutoStopMinutes}
        />

        <RunningTasks serviceId={serviceId} tasks={serviceTasks} now={now} />
      </div>
    </div>
  );
}
