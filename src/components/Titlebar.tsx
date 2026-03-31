import { Service } from "../types";
import appIcon from "../../assets/ico/icon.png";
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";

interface TitlebarProps {
  activeService: Service | null;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
}

export default function Titlebar({
  activeService,
  onReload,
  onGoBack,
  onGoForward,
}: TitlebarProps) {
  return (
    <div className="titlebar-drag flex items-center bg-sidebar px-2 select-none shrink-0 border-b border-[#313244]" style={{ height: 46 }}>
      {/* Navigation controls */}
      <div className="titlebar-no-drag flex items-center gap-1 ml-[68px]">
        {activeService ? (
          <>
            <button
              onClick={onGoBack}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors text-sm"
              title="Go back"
            >
              &#8592;
            </button>
            <button
              onClick={onGoForward}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors text-sm"
              title="Go forward"
            >
              &#8594;
            </button>
            <button
              onClick={onReload}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors text-sm"
              title="Reload"
            >
              &#8635;
            </button>
            <span className="text-xs text-gray-500 ml-2 truncate max-w-[300px]">
              {activeService.name}
            </span>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <img src={appIcon} alt="Largs Hub" className="w-5 h-5" />
            <span className="text-sm text-gray-400 font-medium">Largs Hub</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Window controls */}
      <div className="titlebar-no-drag flex items-center">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-12 flex items-center justify-center hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors" style={{ height: 46 }}
        >
          <VscChromeMinimize size={16} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="w-12 flex items-center justify-center hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors" style={{ height: 46 }}
        >
          <VscChromeMaximize size={16} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-12 flex items-center justify-center hover:bg-red-600 text-gray-400 hover:text-white transition-colors" style={{ height: 46 }}
        >
          <VscChromeClose size={16} />
        </button>
      </div>
    </div>
  );
}
