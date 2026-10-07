// The Ctrl+N number on a sidebar button while Ctrl is held. Bottom-right so it
// never covers a notification count in the top-right; the button must be
// `relative`.
export default function ShortcutHint({ number }: { number: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-1 -right-1 rounded-md min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[11px] font-bold tabular-nums"
      style={{
        color: "var(--sidebar)",
        background: "var(--text-primary)",
        boxShadow: "0 0 0 2px var(--sidebar)",
      }}
    >
      {number}
    </span>
  );
}
