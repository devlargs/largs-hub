import { Service } from "../types";

interface RetiredNoteTakerScreenProps {
  service: Service;
  onRemove: () => void;
}

// One-time notice for services still carrying the old "notion-notes" type.
// The Notion Note Taker was replaced by the Pomodoro service; this explains
// where it went and offers to clean the entry up. The user's Notion database
// is untouched either way — only the app-side link is gone.
export default function RetiredNoteTakerScreen({
  service,
  onRemove,
}: RetiredNoteTakerScreenProps) {
  return (
    <div
      className="h-full overflow-y-auto flex items-center justify-center"
      style={{ background: "var(--surface)", padding: 24 }}
    >
      <div
        className="rounded-3xl w-full"
        style={{
          maxWidth: 520,
          background: "var(--sidebar)",
          border: "1px solid var(--border)",
          padding: "36px 40px",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 12,
          }}
        >
          The Note Taker has been retired
        </h2>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--text-secondary)",
            marginBottom: 12,
          }}
        >
          “{service.name}” was a Notion Note Taker service, which has been replaced by{" "}
          <strong>Pomodoro</strong> — a daily task list with a focus timer, which can sync to a
          Notion database in the same way.
        </p>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--text-secondary)",
            marginBottom: 24,
          }}
        >
          Your notes are safe: they live in your own Notion database and nothing there has been
          changed or deleted. Add “Pomodoro” from the <strong>+</strong> button in the sidebar to
          start using the new service.
        </p>
        <button
          onClick={onRemove}
          className="w-full text-sm font-semibold cursor-pointer transition-all"
          style={{
            padding: "12px 24px",
            borderRadius: 12,
            background: "var(--accent)",
            border: "none",
            color: "var(--surface)",
          }}
        >
          Remove this service
        </button>
      </div>
    </div>
  );
}
