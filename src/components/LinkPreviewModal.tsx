import { useEffect, useState } from "react";
import { IoClose, IoOpenOutline } from "react-icons/io5";
import { LINK_PREVIEW_HEADER, LINK_PREVIEW_MARGIN, LINK_PREVIEW_MAX_WIDTH } from "@shared/layout";
import { useModalDismiss } from "../hooks/useModalDismiss";

// The page renders in a native view main positions from these same constants,
// so the chrome drawn here lines up with it exactly.

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

  // Escape closes. No focus trap here: the page itself renders in a native view
  // below this chrome, so trapping focus in the React header would take it away
  // from the page the user is actually reading (issue #88).
  const modalRef = useModalDismiss<HTMLDivElement>({ onDismiss: onClose, trapFocus: false });

  const modalWidth = Math.min(LINK_PREVIEW_MAX_WIDTH, windowWidth - LINK_PREVIEW_MARGIN * 2);

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
        ref={modalRef}
        role="dialog"
        aria-label="Link preview"
        className="bg-sidebar shadow-2xl absolute flex flex-col overflow-hidden"
        style={{
          top: LINK_PREVIEW_MARGIN,
          bottom: LINK_PREVIEW_MARGIN,
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
            height: LINK_PREVIEW_HEADER,
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
            aria-label="Open in browser"

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
            aria-label="Close"

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
