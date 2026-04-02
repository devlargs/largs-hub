import { Service } from "../types";
import appIcon from "../../assets/ico/icon.png";
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";
import { IoArrowBack, IoArrowForward, IoReload, IoSettingsSharp } from "react-icons/io5";

interface TitlebarProps {
  activeService: Service | null;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenSettings: () => void;
}

export default function Titlebar({
  activeService,
  onReload,
  onGoBack,
  onGoForward,
  onOpenSettings,
}: TitlebarProps) {
  return (
    <div className="titlebar-drag flex items-center bg-sidebar select-none shrink-0" style={{ height: 46, paddingLeft: 24, paddingRight: 8, borderBottom: "1px solid var(--border)" }}>
      {/* Navigation controls */}
      <div className="titlebar-no-drag flex items-center gap-1">
        {activeService ? (
          <>
            <button
              onClick={onGoBack}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Go back"
            >
              <IoArrowBack size={14} />
            </button>
            <button
              onClick={onGoForward}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Go forward"
            >
              <IoArrowForward size={14} />
            </button>
            <button
              onClick={onReload}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Reload"
            >
              <IoReload size={14} />
            </button>
            <span className="text-xs ml-2 truncate max-w-[300px]" style={{ color: "var(--text-muted)" }}>
              {activeService.name}
            </span>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <img src={appIcon} alt="Largs Hub" className="w-5 h-5" />
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Largs Hub</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Settings gear + Window controls */}
      <div className="titlebar-no-drag flex items-center">
        <button
          onClick={onOpenSettings}
          className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors"
          style={{ height: 46, color: "var(--text-muted)" }}
          title="Settings"
        >
          <IoSettingsSharp size={15} />
        </button>
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors" style={{ height: 46, color: "var(--text-muted)" }}
        >
          <VscChromeMinimize size={16} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors" style={{ height: 46, color: "var(--text-muted)" }}
        >
          <VscChromeMaximize size={16} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-12 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors" style={{ height: 46, color: "var(--text-muted)" }}
        >
          <VscChromeClose size={16} />
        </button>
      </div>
    </div>
  );
}
