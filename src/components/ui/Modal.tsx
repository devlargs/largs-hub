import { useCallback, useEffect, useRef, useState } from "react";
import { useModalDismiss } from "../../hooks/useModalDismiss";

// The one modal shell in the app (issue #104).
//
// Every overlay used to hand-roll the same four things — a blurred backdrop, an
// enter/exit transition, the Escape/focus-trap wiring, and the z-order dance
// that puts React above the native service views. Four copies meant four
// slightly different modals, and destructive prompts fell back to the OS
// message box, which looks like it belongs to Windows rather than to Largs Hub.
//
// Callers supply only the panel's contents and its size.

// Matches --dur-short. The panel is unmounted by the parent, so the exit has to
// finish before onClose fires, not after.
const EXIT_MS = 200;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ModalProps {
  /** The dialog's accessible name. */
  label: string;
  /** Escape, a backdrop click, or a child calling the close it was handed. */
  onClose: () => void;
  /**
   * The panel's contents. Pass a function to receive the shell's own close —
   * a Cancel button inside the panel should play the exit, not vanish.
   */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  width?: number | string;
  maxHeight?: number | string;
  padding?: number | string;
  /** Extra classes for the panel, for the rare overlay that needs its own chrome. */
  panelClassName?: string;
  /** Off for a nested overlay that owns Escape itself. */
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /** Off for the link preview, whose page lives in a native view and keeps focus. */
  trapFocus?: boolean;
  /** Raise for a modal opened on top of another one. */
  zIndex?: number;
}

export default function Modal({
  label,
  onClose,
  children,
  width = 400,
  maxHeight,
  padding = 32,
  panelClassName = "",
  closeOnEscape = true,
  closeOnBackdrop = true,
  trapFocus = true,
  zIndex = 50,
}: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  // The exit runs once: a second Escape while it's playing must not queue a
  // second onClose.
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  // Child-view z-order isn't reliable on Windows, so main hides the active
  // service view while any overlay is up (CLAUDE.md). Ref-counted there, so a
  // modal opened from a modal still works.
  useEffect(() => {
    window.electronAPI?.bringUiToFront();
    return () => window.electronAPI?.sendUiToBack();
  }, []);

  const requestClose = useCallback(() => {
    if (exitTimer.current) return;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    exitTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Escape closes, Tab stays inside, focus returns to the trigger (issue #88).
  const panelRef = useModalDismiss<HTMLDivElement>({
    onDismiss: requestClose,
    closeOnEscape,
    trapFocus,
  });

  const shown = visible && !closing;
  // Spatial motion collapses to a plain crossfade when the system asks for less.
  const reduced = prefersReducedMotion();

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex,
        backgroundColor: shown ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)",
        backdropFilter: shown ? "blur(4px)" : "blur(0px)",
        transition: `background-color ${reduced ? 150 : EXIT_MS}ms var(--ease-out), backdrop-filter ${
          reduced ? 150 : EXIT_MS
        }ms var(--ease-out)`,
      }}
      onClick={closeOnBackdrop ? requestClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`bg-sidebar rounded-3xl shadow-2xl mx-4 ${panelClassName}`}
        style={{
          width,
          maxHeight,
          padding,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          opacity: shown ? 1 : 0,
          transform: reduced ? "none" : shown ? "scale(1)" : "scale(0.95) translateY(12px)",
          transition: `opacity ${reduced ? 150 : EXIT_MS}ms var(--ease-out), transform ${EXIT_MS}ms var(--ease-out)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {typeof children === "function" ? children(requestClose) : children}
      </div>
    </div>
  );
}
