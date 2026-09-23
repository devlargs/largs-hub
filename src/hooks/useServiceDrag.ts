import { useCallback, useEffect, useRef, useState } from "react";
import { moveOnto } from "../lib/serviceOrder";

// A transparent 1×1 GIF: the drag ghost, since the sidebar shows its own
// indicator instead.
const EMPTY_DRAG_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Drag-to-reorder for the sidebar's service buttons.
//
// A 300ms long-press only *arms* a service for dragging (armedId, which makes
// it draggable); it isn't draggedId — and doesn't fade — until a drag has
// actually started. Arming it straight into the dragged state left the icon
// faded for good whenever the press ended without a drag, since no dragend
// ever comes to clear it.
export function useServiceDrag(
  serviceIds: string[],
  onReorderServices: (serviceIds: string[]) => void,
) {
  const [armedId, setArmedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once a drag starts, so the click that ends it doesn't also select
  const didDrag = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const resetDrag = useCallback(() => {
    setArmedId(null);
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  const handlePointerDown = useCallback((serviceId: string) => {
    didDrag.current = false;
    longPressTimer.current = setTimeout(() => setArmedId(serviceId), 300);
  }, []);

  // A press that ends without a drag disarms, so the next plain click doesn't
  // start from a draggable button.
  const handlePointerUp = useCallback(() => {
    clearLongPress();
    setArmedId(null);
  }, [clearLongPress]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, serviceId: string) => {
      if (armedId !== serviceId) {
        e.preventDefault();
        return;
      }
      didDrag.current = true;
      e.dataTransfer.effectAllowed = "move";
      const img = new Image();
      img.src = EMPTY_DRAG_IMAGE;
      e.dataTransfer.setDragImage(img, 0, 0);
      setDraggedId(serviceId);
    },
    [armedId],
  );

  const handleDragOver = useCallback((e: React.DragEvent, serviceId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(serviceId);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      resetDrag();
      if (!draggedId) return;
      const reordered = moveOnto(serviceIds, draggedId, targetId);
      if (reordered) onReorderServices(reordered);
    },
    [draggedId, serviceIds, onReorderServices, resetDrag],
  );

  // A drag that ends outside the sidebar (dropped on the service page, which
  // is a separate native view, or outside the window) isn't guaranteed to
  // deliver dragend here, notably on macOS. So while one is under way, any
  // sign the button is back up ends it too: a drop or dragend anywhere in the
  // page, or the pointer moving again with no button held.
  useEffect(() => {
    if (!armedId && !draggedId) return;
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons === 0) resetDrag();
    };
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("drop", resetDrag);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("drop", resetDrag);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [armedId, draggedId, resetDrag]);

  // Clear any pending long-press timer if the sidebar unmounts mid-press
  useEffect(() => clearLongPress, [clearLongPress]);

  // The props a service button spreads on, plus what it needs to draw itself.
  const dragProps = (serviceId: string) => ({
    draggable: armedId === serviceId || draggedId === serviceId,
    onPointerDown: () => handlePointerDown(serviceId),
    onPointerUp: handlePointerUp,
    onPointerLeave: clearLongPress,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, serviceId),
    onDragOver: (e: React.DragEvent) => handleDragOver(e, serviceId),
    onDrop: (e: React.DragEvent) => handleDrop(e, serviceId),
    onDragEnd: resetDrag,
  });

  return {
    dragProps,
    draggedId,
    dropTargetId,
    // Whether the click that just happened ended a drag, not a selection
    wasDrag: () => didDrag.current,
  };
}
