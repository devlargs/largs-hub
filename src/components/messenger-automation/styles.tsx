import type { CSSProperties, ReactNode } from "react";

export const inputStyle = {
  padding: "8px 12px",
  backgroundColor: "var(--surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
} as const;

export const labelStyle = { color: "var(--text-muted)" } as const;

// A labelled column: the small muted label above its input.
export function Field({
  label,
  className = "flex flex-col",
  style,
  children,
}: {
  label: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={className} style={{ gap: 4, ...style }}>
      <label className="text-xs font-medium" style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  );
}
