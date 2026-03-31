import { useEffect, useState } from "react";
import { Service, SystemStats } from "../types";
import appIcon from "../../assets/ico/icon.png";
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";
import { IoArrowBack, IoArrowForward, IoReload } from "react-icons/io5";

interface TitlebarProps {
  activeService: Service | null;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-8 h-1 rounded-full bg-[#313244] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  );
}

function getStatColor(value: number): string {
  if (value < 50) return "#a6e3a1";
  if (value < 80) return "#f9e2af";
  return "#f38ba8";
}


export default function Titlebar({
  activeService,
  onReload,
  onGoBack,
  onGoForward,
}: TitlebarProps) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.startSystemStats();
    const unsub = window.electronAPI.onSystemStats(setStats);
    return () => {
      unsub();
      window.electronAPI.stopSystemStats();
    };
  }, []);

  const memPercent = stats ? Math.round((stats.memUsed / stats.memTotal) * 100) : 0;

  return (
    <div className="titlebar-drag flex items-center bg-sidebar select-none shrink-0 border-b border-[#313244]" style={{ height: 46, paddingLeft: 24, paddingRight: 8 }}>
      {/* Navigation controls */}
      <div className="titlebar-no-drag flex items-center gap-1">
        {activeService ? (
          <>
            <button
              onClick={onGoBack}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors"
              title="Go back"
            >
              <IoArrowBack size={14} />
            </button>
            <button
              onClick={onGoForward}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors"
              title="Go forward"
            >
              <IoArrowForward size={14} />
            </button>
            <button
              onClick={onReload}
              className="w-7 h-6 flex items-center justify-center rounded hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors"
              title="Reload"
            >
              <IoReload size={14} />
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

      {/* System stats */}
      {stats && (
        <div className="titlebar-no-drag flex items-center gap-4 mr-2 px-3 py-1 rounded-lg bg-[#11111b]/60">
          <div className="flex items-center gap-1.5" title={`CPU: ${stats.cpu}%`}>
            <span className="text-xs font-medium tracking-wide" style={{ color: getStatColor(stats.cpu) }}>CPU</span>
            <MiniBar value={stats.cpu} color={getStatColor(stats.cpu)} />
            <span className="text-xs text-gray-500 w-8 text-right font-mono">{stats.cpu}%</span>
          </div>
          <div className="flex items-center gap-1.5" title={`Memory: ${stats.memUsed} / ${stats.memTotal} MB (App: ${stats.appMem} MB)`}>
            <span className="text-xs font-medium tracking-wide" style={{ color: getStatColor(memPercent) }}>MEM</span>
            <MiniBar value={memPercent} color={getStatColor(memPercent)} />
            <span className="text-xs text-gray-500 w-8 text-right font-mono">{memPercent}%</span>
          </div>
          <div className="flex items-center gap-1.5" title={`App memory: ${stats.appMem} MB`}>
            <span className="text-xs font-medium tracking-wide text-[#89b4fa]">APP</span>
            <span className="text-xs text-gray-500 font-mono">{stats.appMem} MB</span>
          </div>
        </div>
      )}

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
