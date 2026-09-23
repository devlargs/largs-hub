import { useState } from "react";
import type { AutoStopState } from "../../types";
import { formatCountdown } from "../../lib/automationForm";
import { Field, inputStyle, labelStyle } from "./styles";

interface AutoStopSectionProps {
  serviceId: string;
  autoStop: AutoStopState | null;
  onChange: (state: AutoStopState | null) => void;
  now: number;
}

// Clears every task for this service once the countdown expires.
export default function AutoStopSection({
  serviceId,
  autoStop,
  onChange,
  now,
}: AutoStopSectionProps) {
  const [minutes, setMinutes] = useState("30");
  const [error, setError] = useState<string | null>(null);

  const handleArm = async () => {
    setError(null);
    const result = await window.electronAPI.messengerAutomation.setAutoStop(
      serviceId,
      Number(minutes),
    );
    if (!result.ok) {
      setError(result.error ?? "Could not set the auto-stop");
      return;
    }
    onChange(result.autoStop);
  };

  const handleCancel = async () => {
    setError(null);
    await window.electronAPI.messengerAutomation.setAutoStop(serviceId, null);
    onChange(null);
  };

  return (
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
        Clears every automation for this service once the timer runs out. It keeps counting while
        this panel is closed.
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
            onClick={handleCancel}
            className="text-xs rounded hover:bg-sidebar-hover transition-colors"
            style={{ padding: "4px 10px", color: "#f38ba8" }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-end" style={{ gap: 8, marginTop: 8 }}>
          <Field label="Clear after (minutes)" className="flex flex-col flex-1">
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="text-sm outline-none rounded-lg w-full"
              style={inputStyle}
            />
          </Field>
          <button
            onClick={handleArm}
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
      {error && (
        <p className="text-xs" style={{ color: "#f38ba8", marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
