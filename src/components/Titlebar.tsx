import { useState, useRef, useEffect } from "react";
import { Service } from "../types";
import appIcon from "../../assets/ico/icon.png";
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";
import { IoArrowBack, IoArrowForward, IoReload, IoSettingsSharp } from "react-icons/io5";

interface TitlebarProps {
  activeService: Service | null;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onShowUpdatePage: () => void;
}

export default function Titlebar({
  activeService,
  onReload,
  onGoBack,
  onGoForward,
  onShowUpdatePage,
}: TitlebarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    window.electronAPI?.bringUiToFront();
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.electronAPI?.sendUiToBack();
    };
  }, [showMenu]);

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
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="w-12 flex items-center justify-center hover:bg-sidebar-hover transition-colors"
            style={{ height: 46, color: "var(--text-muted)" }}
            title="Settings"
          >
            <IoSettingsSharp size={15} />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 rounded-xl shadow-2xl"
              style={{
                top: 46,
                minWidth: 200,
                padding: 6,
                backgroundColor: "var(--context-bg)",
                border: "1px solid var(--border)",
                zIndex: 9999,
              }}
            >
              <button
                className="w-full text-left text-sm transition-colors rounded-lg cursor-pointer"
                style={{ padding: "10px 14px", color: "var(--text-primary)" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--context-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                onClick={() => {
                  setShowMenu(false);
                  onShowUpdatePage();
                }}
              >
                Check for Updates
              </button>
            </div>
          )}
        </div>
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
