import { isInternalService, Service } from "../types";
import appIcon from "../../assets/ico/icon.png";
import { TITLEBAR_HEIGHT } from "@shared/layout";
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";
import {
  IoArrowBack,
  IoArrowForward,
  IoReload,
  IoSettingsSharp,
  IoFlashOutline,
} from "react-icons/io5";

interface TitlebarProps {
  activeService: Service | null;
  // Current zoom of the active service (1 = 100%); shown only when it isn't 100%
  zoomFactor: number;
  onResetZoom: () => void;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenSettings: () => void;
  showAutomation: boolean;
  automationActive: boolean;
  onOpenAutomation: () => void;
}

export default function Titlebar({
  activeService,
  zoomFactor,
  onResetZoom,
  onReload,
  onGoBack,
  onGoForward,
  onOpenSettings,
  showAutomation,
  automationActive,
  onOpenAutomation,
}: TitlebarProps) {
  return (
    <div
      className="titlebar-drag flex items-center bg-sidebar select-none shrink-0"
      style={{
        height: TITLEBAR_HEIGHT,
        paddingLeft: 24,
        paddingRight: 8,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Navigation controls */}
      <div className="titlebar-no-drag flex items-center gap-1">
        {activeService ? (
          <>
            {/* Internal services (React pages) have no web view to navigate */}
            {!isInternalService(activeService) && (
              <>
                <button
                  onClick={onGoBack}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Go back"

                  title="Go back"
                >
                  <IoArrowBack size={14} />
                </button>
                <button
                  onClick={onGoForward}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Go forward"

                  title="Go forward"
                >
                  <IoArrowForward size={14} />
                </button>
                <button
                  onClick={onReload}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Reload"

                  title="Reload"
                >
                  <IoReload size={14} />
                </button>
              </>
            )}
            <span
              className="text-xs ml-2 truncate max-w-[300px]"
              style={{ color: "var(--text-muted)" }}
            >
              {activeService.name}
            </span>
            {/* A zoomed service is easy to forget about — show the factor and
                make it one click back to 100%. */}
            {!isInternalService(activeService) && zoomFactor !== 1 && (
              <button
                onClick={onResetZoom}
                className="text-2xs ml-1.5 px-1.5 py-0.5 rounded hover:bg-sidebar-hover transition-colors tabular-nums"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                aria-label="Reset zoom to 100% (Ctrl+0)"

                title="Reset zoom to 100% (Ctrl+0)"
              >
                {Math.round(zoomFactor * 100)}%
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <img src={appIcon} alt="Largs Hub" className="w-5 h-5" />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Largs Hub
            </span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Settings gear + Window controls */}
      <div className="titlebar-no-drag flex items-center">
        {showAutomation && (
          <button
            onClick={onOpenAutomation}
            className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors relative"
            style={{ height: TITLEBAR_HEIGHT, color: "var(--text-muted)" }}
            aria-label="Messenger automation"

            title="Messenger automation"
          >
            <IoFlashOutline size={15} />
            {automationActive && (
              <span
                className="absolute rounded-full"
                style={{ top: 12, right: 14, width: 6, height: 6, background: "var(--accent)" }}
              />
            )}
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors"
          style={{ height: TITLEBAR_HEIGHT, color: "var(--text-muted)" }}
          aria-label="Settings"
          title="Settings"
        >
          <IoSettingsSharp size={15} />
        </button>
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
          className="w-12 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
          style={{ height: TITLEBAR_HEIGHT, color: "var(--text-muted)" }}
        >
          <VscChromeClose size={16} />
        </button>
      </div>
    </div>
  );
}
