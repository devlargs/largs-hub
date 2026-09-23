import { IoChevronBack, IoChevronForward, IoPencil, IoTrash } from "react-icons/io5";
import type { MessageListGroup } from "../../types";
import { messageCountLabel } from "../../lib/messageListView";
import { labelStyle } from "./styles";

const iconButtonClass =
  "flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors";
const iconButtonStyle = { width: 24, height: 24, color: "var(--text-muted)" } as const;

interface ListRowProps {
  group: MessageListGroup;
  active: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// One saved list: click to select (or deselect), with edit and delete buttons.
export function ListRow({ group, active, busy, onToggle, onEdit, onDelete }: ListRowProps) {
  const preview = group.messages.join("\n");
  return (
    <div
      className="flex items-center rounded-lg"
      style={{
        gap: 6,
        padding: "6px 8px",
        backgroundColor: active ? "var(--sidebar-active)" : "var(--surface)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      <button
        onClick={onToggle}
        className="flex flex-col flex-1 min-w-0 text-left"
        aria-label={preview}
        title={preview}
      >
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {group.name}
        </span>
        <span className="text-2xs" style={labelStyle}>
          {messageCountLabel(group.messages.length)}
        </span>
      </button>
      <button
        onClick={onEdit}
        className={`${iconButtonClass} shrink-0`}
        style={iconButtonStyle}
        aria-label="Edit list"
        title="Edit list"
      >
        <IoPencil size={13} />
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        className={`${iconButtonClass} shrink-0`}
        style={iconButtonStyle}
        aria-label="Delete list"
        title="Delete list"
      >
        <IoTrash size={13} />
      </button>
    </div>
  );
}

interface PagerProps {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}

// Previous / next with "n / total" between; zero-based `page`.
export function Pager({ page, pageCount, onPage }: PagerProps) {
  return (
    <div className="flex items-center justify-center" style={{ gap: 8 }}>
      <button
        onClick={() => onPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className={`${iconButtonClass} disabled:opacity-40`}
        style={iconButtonStyle}
        aria-label="Previous page"
        title="Previous page"
      >
        <IoChevronBack size={13} />
      </button>
      <span className="text-2xs tabular-nums" style={labelStyle}>
        {page + 1} / {pageCount}
      </span>
      <button
        onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
        disabled={page >= pageCount - 1}
        className={`${iconButtonClass} disabled:opacity-40`}
        style={iconButtonStyle}
        aria-label="Next page"
        title="Next page"
      >
        <IoChevronForward size={13} />
      </button>
    </div>
  );
}
