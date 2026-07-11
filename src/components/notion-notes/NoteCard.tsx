import { useState } from "react";
import {
  MdCheckBox,
  MdCheckBoxOutlineBlank,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight,
  MdOutlinePushPin,
  MdPushPin,
} from "react-icons/md";
import { NotionNote } from "../../types";

interface NoteCardProps {
  note: NotionNote;
  onOpen: () => void;
  onToggleItem: (index: number) => void;
  onTogglePin: () => void;
}

const CARD_MAX_ITEMS = 8;

export default function NoteCard({ note, onOpen, onToggleItem, onTogglePin }: NoteCardProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const rows = note.items.map((item, index) => ({ item, index }));
  const active = rows.filter((row) => !row.item.checked);
  const done = rows.filter((row) => row.item.checked);
  const visibleActive = active.slice(0, CARD_MAX_ITEMS);
  const hiddenActive = active.length - visibleActive.length;

  return (
    <div
      className="group rounded-lg overflow-hidden transition-shadow hover:shadow-lg"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
      onClick={onOpen}
    >
      {note.imageUrl && (
        <img
          src={note.imageUrl}
          alt=""
          className="w-full block"
          style={{ maxHeight: 320, objectFit: "cover" }}
          draggable={false}
        />
      )}
      <div style={{ padding: "12px 16px 14px" }}>
        <div className="flex items-start" style={{ gap: 8, minHeight: note.title ? undefined : 0 }}>
          <div
            className="flex-1"
            style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}
          >
            {note.title}
          </div>
          <button
            className={`rounded-full flex items-center justify-center transition-opacity cursor-pointer hover:bg-sidebar-hover ${
              note.pinned ? "" : "opacity-0 group-hover:opacity-100"
            }`}
            style={{
              width: 28,
              height: 28,
              color: "var(--text-secondary)",
              background: "transparent",
              border: "none",
              flexShrink: 0,
              marginTop: -4,
              marginRight: -6,
            }}
            title={note.pinned ? "Unpin note" : "Pin note"}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
          >
            {note.pinned ? <MdPushPin size={16} /> : <MdOutlinePushPin size={16} />}
          </button>
        </div>

        {note.text && (
          <div
            style={{
              marginTop: note.title ? 6 : 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 12,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {note.text}
          </div>
        )}

        {visibleActive.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {visibleActive.map(({ item, index }) => (
              <div key={index} className="flex items-start" style={{ gap: 8, padding: "2px 0" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleItem(index);
                  }}
                  className="cursor-pointer"
                  style={{
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                  title="Mark as done"
                >
                  <MdCheckBoxOutlineBlank size={15} />
                </button>
                <span style={{ fontSize: 13, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                  {item.text}
                </span>
              </div>
            ))}
            {hiddenActive > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 0 0 23px" }}>
                + {hiddenActive} more
              </div>
            )}
          </div>
        )}

        {done.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCompleted((v) => !v);
              }}
              className="flex items-center cursor-pointer"
              style={{
                gap: 2,
                fontSize: 12,
                color: "var(--text-secondary)",
                background: "transparent",
                border: "none",
                padding: 0,
              }}
            >
              {showCompleted ? <MdKeyboardArrowDown size={16} /> : <MdKeyboardArrowRight size={16} />}
              {done.length} Completed item{done.length === 1 ? "" : "s"}
            </button>
            {showCompleted &&
              done.map(({ item, index }) => (
                <div key={index} className="flex items-start" style={{ gap: 8, padding: "2px 0" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleItem(index);
                    }}
                    className="cursor-pointer"
                    style={{
                      color: "var(--text-muted)",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                    title="Mark as not done"
                  >
                    <MdCheckBox size={15} />
                  </button>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      textDecoration: "line-through",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
