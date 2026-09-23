import React from "react";

// The building blocks every settings section is made of.

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        className="text-xs font-semibold uppercase tracking-wider"
        style={{
          color: "var(--text-muted)",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
      </h2>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export function SettingRow({
  label,
  description,
  statusColor,
  children,
}: {
  label: string;
  description: string;
  statusColor?: string;
  children: React.ReactNode;
}) {
  return (
    // Label left, control right, on one line at every width — a control that
    // stacks under its own label reads as a separate thing from the setting it
    // belongs to (issue #98). The label column takes the slack and the control
    // keeps its intrinsic size, so the two stay on the same optical line
    // however the description wraps.
    <div className="flex flex-row items-center justify-between gap-3 rounded-lg py-2 @lg:gap-6 @lg:px-3.5 @lg:py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        <div
          className="text-xs break-words @lg:truncate"
          style={{ color: statusColor || "var(--text-muted)", marginTop: 2 }}
        >
          {description}
        </div>
      </div>
      <div className="flex shrink-0 justify-end">
        {/* The row's label is the control's accessible name; a bare Toggle has
            no text of its own. */}
        {React.isValidElement(children) && children.type === Toggle
          ? React.cloneElement(children as React.ReactElement<{ label?: string }>, { label })
          : children}
      </div>
    </div>
  );
}

export function Slider({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="flex w-[140px] items-center gap-3 @lg:w-auto @lg:min-w-[180px]">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: "var(--accent)" }}
      />
      <span
        className="text-xs tabular-nums text-right"
        style={{ color: "var(--text-muted)", width: 34 }}
      >
        {value}%
      </span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  // Supplied by SettingRow: the switch is graphical, so without this a screen
  // reader announces an unnamed control (issue #88).
  label?: string;
}) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="relative rounded-full transition-colors cursor-pointer"
      style={{
        width: 44,
        height: 24,
        backgroundColor: checked ? "var(--accent)" : "var(--border)",
      }}
    >
      <span
        className="absolute rounded-full bg-white transition-transform"
        style={{
          width: 18,
          height: 18,
          top: 3,
          left: 3,
          transform: checked ? "translateX(20px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

// A minutes picker: the value is a number of minutes, each option a label.
export function MinutesSelect({
  value,
  options,
  onChange,
}: {
  value: number;
  options: Array<[minutes: number, label: string]>;
  onChange: (minutes: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="text-sm rounded-lg cursor-pointer outline-none"
      style={{
        padding: "6px 10px",
        backgroundColor: "var(--sidebar-hover)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      }}
    >
      {options.map(([minutes, label]) => (
        <option key={minutes} value={minutes}>
          {label}
        </option>
      ))}
    </select>
  );
}

// The quiet, surface-coloured button used for secondary actions.
export function SecondaryButton({
  onClick,
  className = "",
  children,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`${className} rounded-lg text-sm font-medium transition-colors cursor-pointer hover:opacity-90`.trim()}
      style={{
        padding: "6px 14px",
        backgroundColor: "var(--sidebar-hover)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </button>
  );
}
