import { useEffect, useRef } from "react";

// Keyboard behaviour every overlay in the app should have: Escape closes it,
// Tab stays inside it while it's open, and focus goes back where it came from
// when it closes.
//
// None of the three overlays had any of this — they closed on a backdrop click
// or a Cancel button only, so a keyboard user could tab out of a modal into the
// page behind it and had no way to dismiss it (issue #88).

/** Everything focusable, minus anything explicitly removed from the tab order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalDismissOptions {
  /** Called on Escape. */
  onDismiss: () => void;
  /** Set false to leave Escape to something else (a nested picker, say). */
  closeOnEscape?: boolean;
  /** Set false when the overlay must not steal focus (the link preview, whose
   *  page lives in a native view and handles its own keys). */
  trapFocus?: boolean;
}

/**
 * Returns a ref to put on the overlay's outermost element.
 */
export function useModalDismiss<T extends HTMLElement = HTMLDivElement>({
  onDismiss,
  closeOnEscape = true,
  trapFocus = true,
}: ModalDismissOptions) {
  const containerRef = useRef<T>(null);
  // Read inside the listener so a caller passing a fresh closure each render
  // doesn't re-bind (and re-steal focus) on every keystroke.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    // Whatever had focus before the overlay opened, to hand it back on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Captured for the cleanup: the ref may be null by the time it runs, but
    // the overlay root itself doesn't change while it's mounted.
    const containerAtMount = containerRef.current;

    if (trapFocus) {
      const container = containerRef.current;
      // Prefer the first real control; fall back to the container itself so
      // focus is at least inside the overlay.
      const first = container?.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else container?.focus();
    }

    const handleKeydown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        e.preventDefault();
        dismissRef.current();
        return;
      }
      if (!trapFocus || e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Wrap at both ends, and pull focus back in if it escaped somehow.
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      // Only restore if focus is still somewhere in the overlay — if the user
      // has clicked elsewhere since, yanking it back would be worse.
      const active = document.activeElement;
      if (
        trapFocus &&
        previouslyFocused &&
        (!containerAtMount || containerAtMount.contains(active))
      ) {
        previouslyFocused.focus?.();
      }
    };
  }, [closeOnEscape, trapFocus]);

  return containerRef;
}
