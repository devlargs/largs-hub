import { useEffect, useId, useRef, useState } from "react";
import { IoInformationCircleOutline } from "react-icons/io5";

// The ⓘ next to a setting's name. Clicking it opens a small popup explaining
// the setting; clicking it again, clicking anywhere else or pressing Escape
// closes it. The settings page only shows while no service view is on screen,
// so a plain HTML popup is enough here (no bringUiToFront).
export default function InfoPopover({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        title={`About ${label}`}
        className="flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-sidebar-hover"
        style={{ width: 20, height: 20, color: open ? "var(--accent)" : "var(--text-muted)" }}
      >
        <IoInformationCircleOutline size={15} />
      </button>
      {open && (
        <span
          id={popupId}
          role="dialog"
          aria-label={label}
          className="absolute z-20 rounded-lg text-xs shadow-lg"
          style={{
            top: "calc(100% + 6px)",
            left: -8,
            width: "max-content",
            maxWidth: 280,
            padding: "10px 12px",
            lineHeight: 1.5,
            backgroundColor: "var(--panel)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
