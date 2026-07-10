import { useEffect, useState } from "react";
import { IoClose, IoOpenOutline } from "react-icons/io5";

// Geometry must stay in sync with getLinkPreviewBounds() in electron/main.ts
const MARGIN = 40;
const HEADER = 52;

interface LinkPreviewModalProps {
  url: string;
  onClose: () => void;
}

export default function LinkPreviewModal({ url, onClose }: LinkPreviewModalProps) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    setCurrentUrl(url);
  }, [url]);

  useEffect(() => {
    return window.electronAPI.onLinkPreviewNavigated(setCurrentUrl);
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  const modalWidth = Math.min(1100, windowWidth - MARGIN * 2);

  let hostname = currentUrl;
  try {
    hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
  } catch {
    // keep the raw URL if it can't be parsed
  }

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-sidebar shadow-2xl absolute flex flex-col overflow-hidden"
        style={{
          top: MARGIN,
          bottom: MARGIN,
          left: Math.round((windowWidth - modalWidth) / 2),
          width: modalWidth,
          borderRadius: "12px 12px 0 0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — the page itself renders in a native view below this bar */}
        <div
          className="flex items-center"
          style={{
            height: HEADER,
            padding: "0 10px 0 16px",
            gap: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex flex-col flex-1 min-w-0" style={{ gap: 1 }}>
            <span
              className="truncate"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}
            >
              {hostname}
            </span>
            <span className="truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {currentUrl}
            </span>
          </div>
          <button
            onClick={() => {
              window.electronAPI.openLinkExternal(currentUrl);
              onClose();
            }}
            title="Open in browser"
            className="flex items-center justify-center rounded-lg cursor-pointer transition-colors hover:opacity-80"
            style={{
              width: 32,
              height: 32,
              color: "var(--text-primary)",
              backgroundColor: "var(--panel)",
              border: "1px solid var(--border)",
            }}
          >
            <IoOpenOutline size={16} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="flex items-center justify-center rounded-lg cursor-pointer transition-colors hover:opacity-80"
            style={{
              width: 32,
              height: 32,
              color: "var(--text-primary)",
              backgroundColor: "var(--panel)",
              border: "1px solid var(--border)",
            }}
          >
            <IoClose size={18} />
          </button>
        </div>
        {/* Content area — covered by the native WebContentsView once it paints */}
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: "var(--text-muted)", fontSize: 13 }}
        >
          Loading preview…
        </div>
      </div>
    </div>
  );
}
