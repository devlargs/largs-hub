import { TITLEBAR_HEIGHT } from "@shared/layout";
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";

// macOS shows its native traffic lights at the left of the titlebar, so the
// custom window buttons are Windows/Linux only.
export const isMac = window.electronAPI?.platform === "darwin";

/** Minimize / maximize / close for the frameless window; nothing on macOS. */
export default function WindowControls() {
  if (isMac) return null;
  return (
    <>
      <button
        onClick={() => window.electronAPI?.minimize()}
        aria-label="Minimize"
        title="Minimize"
        className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors"
        style={{ height: TITLEBAR_HEIGHT, color: "var(--text-muted)" }}
      >
        <VscChromeMinimize size={16} />
      </button>
      <button
        onClick={() => window.electronAPI?.maximize()}
        aria-label="Maximize"
        title="Maximize"
        className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors"
        style={{ height: TITLEBAR_HEIGHT, color: "var(--text-muted)" }}
      >
        <VscChromeMaximize size={16} />
      </button>
      <button
        onClick={() => window.electronAPI?.close()}
        aria-label="Close"
        title="Close"
        // The muted colour is a class, not an inline style: an inline colour
        // beats `hover:text-white`, leaving a grey X on the red hover.
        className="w-12 flex items-center justify-center text-(--text-muted) hover:bg-red-600 hover:text-white transition-colors"
        style={{ height: TITLEBAR_HEIGHT }}
      >
        <VscChromeClose size={16} />
      </button>
    </>
  );
}
