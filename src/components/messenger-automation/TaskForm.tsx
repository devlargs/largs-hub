import MessageListPicker from "../MessageListPicker";
import {
  AutomationForm,
  HELPER_TEXT,
  canStart,
  intervalMin,
  needsInterval,
  needsMessage,
  startLabel,
} from "../../lib/automationForm";
import { Field, inputStyle, labelStyle } from "./styles";

interface TaskFormProps {
  form: AutomationForm;
  update: (patch: Partial<AutomationForm>) => void;
  // Stack the side-by-side rows when the panel is too narrow for them
  narrow: boolean;
  recentEmojis: string[];
  error: string | null;
  feedback: string | null;
  busy: boolean;
  onStart: () => void;
}

const inputClass = "text-sm outline-none rounded-lg";

// The parameters for the selected function, its status line and the start button.
export default function TaskForm({
  form,
  update,
  narrow,
  recentEmojis,
  error,
  feedback,
  busy,
  onStart,
}: TaskFormProps) {
  const { type } = form;
  const min = intervalMin(type);
  const startable = !busy && canStart(form);
  const rowClass = narrow ? "flex flex-col" : "flex";

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p className="text-xs" style={labelStyle}>
        {HELPER_TEXT[type]}
      </p>

      {needsMessage(type) && (
        <Field label="Message">
          <textarea
            value={form.message}
            onChange={(e) => update({ message: e.target.value })}
            rows={2}
            placeholder="Type your message…"
            className="text-sm outline-none rounded-lg resize-none"
            style={inputStyle}
          />
        </Field>
      )}

      {type === "sendChat" && (
        <Field label="Send at">
          <input
            type="time"
            value={form.time}
            onChange={(e) => update({ time: e.target.value })}
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      )}

      {type === "sendEmoji" && (
        <div className={rowClass} style={{ gap: 8 }}>
          <Field label="Emoji" className="flex flex-col flex-1">
            <input
              type="text"
              value={form.emoji}
              onChange={(e) => update({ emoji: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Max repeat" style={{ width: narrow ? "100%" : 100 }}>
            <input
              type="number"
              min={1}
              max={100}
              value={form.maxLength}
              onChange={(e) => update({ maxLength: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </Field>
        </div>
      )}

      {type === "sendEmoji" && (
        <RecentEmojis
          emojis={recentEmojis}
          selected={form.emoji}
          onPick={(emoji) => update({ emoji })}
        />
      )}

      {needsInterval(type) && (
        <div className={rowClass} style={{ gap: 8 }}>
          <Field label="Min seconds" className="flex flex-col flex-1">
            <input
              type="number"
              min={min}
              value={form.fromSec}
              onChange={(e) => update({ fromSec: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Max seconds" className="flex flex-col flex-1">
            <input
              type="number"
              min={min}
              value={form.toSec}
              onChange={(e) => update({ toSec: e.target.value })}
              className={inputClass}
              style={inputStyle}
            />
          </Field>
        </div>
      )}

      {type === "sendRandomFromList" && (
        <MessageListPicker
          selectedId={form.listGroup?.id ?? null}
          onSelect={(listGroup) => update({ listGroup })}
        />
      )}

      {type === "startCallCycle" && (
        <div className="flex" style={{ gap: 8 }}>
          <Field label="Wait to ring (s)" className="flex flex-col flex-1">
            <input
              type="number"
              min={5}
              value={form.ringSeconds}
              onChange={(e) => update({ ringSeconds: e.target.value })}
              className={inputClass}
              style={inputStyle}
              aria-label="How long to wait before closing the call popup and restarting the cycle"
              title="How long to wait before closing the call popup and restarting the cycle"
            />
          </Field>
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
        onClick={onStart}
        disabled={!startable}
        className="text-sm font-medium rounded-lg transition-colors"
        style={{
          padding: "8px 0",
          backgroundColor: "var(--accent)",
          color: "#fff",
          opacity: startable ? 1 : 0.5,
          cursor: startable ? "pointer" : "default",
        }}
      >
        {startLabel(type)}
      </button>
    </div>
  );
}

function RecentEmojis({
  emojis,
  selected,
  onPick,
}: {
  emojis: string[];
  selected: string;
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      <label className="text-xs font-medium" style={labelStyle}>
        Recent
      </label>
      {emojis.length === 0 ? (
        <p className="text-2xs" style={labelStyle}>
          Emojis you burst show up here, ready to pick again.
        </p>
      ) : (
        <div className="flex flex-wrap" style={{ gap: 4 }}>
          {emojis.map((option) => {
            const active = option === selected;
            return (
              <button
                key={option}
                onClick={() => onPick(option)}
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
  );
}
