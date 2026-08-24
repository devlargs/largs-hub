import { useCallback, useEffect, useRef, useState } from "react";
import { IoArrowUp, IoArrowDown, IoClose } from "react-icons/io5";

// The bar occupies a strip the main process carves out of the service view's
// bounds — it can't be drawn *over* a WebContentsView (see the z-order rule in
// CLAUDE.md). SIDEBAR_WIDTH, TITLEBAR_HEIGHT and BAR_HEIGHT must match
// SIDEBAR_WIDTH / TITLEBAR_HEIGHT / FIND_BAR_HEIGHT in serviceViews.ts.
const SIDEBAR_WIDTH = 68;
const TITLEBAR_HEIGHT = 46;
const BAR_HEIGHT = 44;

interface FindBarProps {
  serviceId: string;
  onClose: () => void;
}

export default function FindBar({ serviceId, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState(0);
  const [ordinal, setOrdinal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [serviceId]);

  useEffect(() => {
    const unsub = window.electronAPI?.onFindResults((result) => {
      if (result.serviceId !== serviceId) return;
      setMatches(result.matches);
      setOrdinal(result.activeMatchOrdinal);
    });
    return unsub;
  }, [serviceId]);

  // Search as the query changes. findNext is false here so each edit restarts
  // the search from the top rather than stepping through the old term.
  useEffect(() => {
    if (!query) {
      setMatches(0);
      setOrdinal(0);
    }
    window.electronAPI?.findInPage(serviceId, query, true, false);
  }, [query, serviceId]);

  const step = useCallback(
    (forward: boolean) => {
      if (!query) return;
      window.electronAPI?.findInPage(serviceId, query, forward, true);
    },
    [query, serviceId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      step(!e.shiftKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const counter = query ? (matches > 0 ? `${ordinal}/${matches}` : "0/0") : "";

  return (
    <div
      className="fixed z-40 flex items-center shrink-0"
      style={{
        top: TITLEBAR_HEIGHT,
        left: SIDEBAR_WIDTH,
        right: 0,
        height: BAR_HEIGHT,
        gap: 8,
        padding: "0 12px",
        backgroundColor: "var(--panel)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in page"
        className="text-sm rounded outline-none"
        style={{
          flex: "0 1 320px",
          height: 28,
          padding: "0 10px",
          backgroundColor: "var(--sidebar)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      />
      <span
        className="text-xs tabular-nums"
        style={{
          color: query && matches === 0 ? "var(--danger)" : "var(--text-muted)",
          minWidth: 44,
        }}
      >
        {counter}
      </span>
      <button
        onClick={() => step(false)}
        disabled={matches === 0}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
        title="Previous match (Shift+Enter)"
      >
        <IoArrowUp size={14} />
      </button>
      <button
        onClick={() => step(true)}
        disabled={matches === 0}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
        title="Next match (Enter)"
      >
        <IoArrowDown size={14} />
      </button>
      <div className="flex-1" />
      <button
        onClick={onClose}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
        style={{ color: "var(--text-muted)" }}
        title="Close (Esc)"
      >
        <IoClose size={16} />
      </button>
    </div>
  );
}
