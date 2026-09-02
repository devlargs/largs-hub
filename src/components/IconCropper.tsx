import { useCallback, useEffect, useRef, useState } from "react";
import { useModalDismiss } from "../hooks/useModalDismiss";
import {
  MAX_ZOOM,
  Offset,
  Size,
  centeredOffset,
  clampOffset,
  coverScale,
  cropRect,
  outputSize,
  zoomOffset,
} from "../lib/cropGeometry";

// Square-crops an uploaded image before it becomes a service icon (issue #101).
// Icons are drawn in a 72px rounded tile, so an off-centre photo or a wide
// screenshot used to be squashed into it with no way to choose what shows.
//
// The maths lives in lib/cropGeometry.ts; this file only drags, zooms, and cuts
// the result out with a canvas.

const FRAME = 260;
// One arrow press. Big enough to be worth pressing, small enough to be precise.
const NUDGE = 8;

interface IconCropperProps {
  /** The picked file, already read as a data URL. */
  source: string;
  onCancel: () => void;
  /** The cropped square, as a PNG data URL. */
  onApply: (dataUrl: string) => void;
}

export default function IconCropper({ source, onCancel, onApply }: IconCropperProps) {
  const [image, setImage] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Pointer id and the grab point, so a drag survives the cursor leaving the frame.
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const base = image ? coverScale(image, FRAME) : 1;
  const scale = base * zoom;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Renders above the service views (CLAUDE.md); the modal underneath has
  // already brought the UI layer forward, and the ref-count nests.
  useEffect(() => {
    window.electronAPI?.bringUiToFront();
    return () => window.electronAPI?.sendUiToBack();
  }, []);

  // Measured off a detached Image so the natural size is known before the first
  // paint — laying out from a zero-sized <img> would flash the image off-centre.
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => {
      const size = { width: probe.naturalWidth, height: probe.naturalHeight };
      if (size.width === 0 || size.height === 0) {
        setFailed(true);
        return;
      }
      setImage(size);
      setOffset(centeredOffset(size, coverScale(size, FRAME), FRAME));
    };
    probe.onerror = () => setFailed(true);
    probe.src = source;
  }, [source]);

  const dialogRef = useModalDismiss<HTMLDivElement>({ onDismiss: onCancel });

  const handleZoom = (next: number) => {
    if (!image) return;
    setOffset((current) => zoomOffset(current, image, FRAME, base * zoom, base * next));
    setZoom(next);
  };

  const move = useCallback(
    (dx: number, dy: number) => {
      if (!image) return;
      setOffset((current) =>
        clampOffset({ x: current.x + dx, y: current.y + dy }, image, scale, FRAME),
      );
    },
    [image, scale],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    move(e.clientX - active.x, e.clientY - active.y);
    drag.current = { ...active, x: e.clientX, y: e.clientY };
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
  };

  // Arrow keys move the image, so the crop is reachable without a pointer
  // (issue #88's keyboard pass).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [NUDGE, 0],
      ArrowRight: [-NUDGE, 0],
      ArrowUp: [0, NUDGE],
      ArrowDown: [0, -NUDGE],
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    move(step[0], step[1]);
  };

  const handleApply = () => {
    const element = imgRef.current;
    if (!image || !element) return;
    const crop = cropRect(offset, image, scale, FRAME);
    const side = outputSize(crop);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) {
      setFailed(true);
      return;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(element, crop.sx, crop.sy, crop.size, crop.size, 0, 0, side, side);
    try {
      // PNG, so transparent logos keep their transparency.
      onApply(canvas.toDataURL("image/png"));
    } catch {
      setFailed(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center transition-all duration-200 ease-out"
      style={{
        backgroundColor: visible ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(4px)" : "blur(0px)",
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Crop icon"
        className="bg-sidebar rounded-3xl shadow-2xl mx-4 transition-all duration-200 ease-out"
        style={{
          padding: 28,
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="font-semibold"
          style={{
            fontSize: "var(--text-lg)",
            color: "var(--text-primary)",
            marginBottom: "var(--space-2xs)",
          }}
        >
          Crop icon
        </h2>
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginBottom: "var(--space-md)",
          }}
        >
          Drag to reposition, and zoom to fill the square.
        </p>

        {failed ? (
          <div
            className="flex items-center justify-center rounded-2xl text-center"
            style={{
              width: FRAME,
              height: FRAME,
              padding: "var(--space-md)",
              fontSize: "var(--text-sm)",
              color: "var(--danger)",
              border: "1px solid var(--border)",
            }}
          >
            That file could not be read as an image.
          </div>
        ) : (
          <div
            role="application"
            aria-label="Crop area. Drag, or use the arrow keys, to reposition the image."
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={handleKeyDown}
            className="relative overflow-hidden rounded-2xl"
            style={{
              width: FRAME,
              height: FRAME,
              backgroundColor: "var(--surface)",
              cursor: image ? "grab" : "default",
              touchAction: "none",
            }}
          >
            {image && (
              <img
                ref={imgRef}
                src={source}
                alt=""
                draggable={false}
                className="absolute select-none"
                style={{
                  left: offset.x,
                  top: offset.y,
                  width: image.width * scale,
                  height: image.height * scale,
                  maxWidth: "none",
                }}
              />
            )}
          </div>
        )}

        <div
          className="flex items-center"
          style={{ gap: "var(--space-sm)", marginTop: "var(--space-md)" }}
        >
          <label
            htmlFor="crop-zoom"
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Zoom
          </label>
          <input
            id="crop-zoom"
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!image}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="min-w-0 flex-1 cursor-pointer"
            style={{ accentColor: "var(--accent)" }}
          />
        </div>

        <div
          className="flex justify-end"
          style={{ gap: "var(--space-xs)", marginTop: "var(--space-md)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg text-sm font-medium cursor-pointer hover:brightness-110"
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--sidebar-hover)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!image}
            className={`rounded-lg text-sm font-semibold ${
              image ? "cursor-pointer hover:brightness-110 active:translate-y-px" : ""
            }`}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--accent)",
              color: "var(--surface)",
              opacity: image ? 1 : 0.5,
            }}
          >
            Use image
          </button>
        </div>
      </div>
    </div>
  );
}
