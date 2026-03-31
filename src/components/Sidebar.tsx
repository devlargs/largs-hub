import { useState, useEffect } from "react";
import { Service, SystemStats } from "../types";
import { resolveIcon } from "../assets/serviceIcons";

interface SidebarProps {
  services: Service[];
  activeServiceId: string | null;
  onSelectService: (id: string) => void;
  onAddService: () => void;
  onRemoveService: (id: string) => void;
  onEditService: (service: Service) => void;
}

function getStatColor(value: number): string {
  if (value < 50) return "#a6e3a1";
  if (value < 80) return "#f9e2af";
  return "#f38ba8";
}

function StatRing({
  label,
  value,
  color,
  tooltip,
}: {
  label: string;
  value: number;
  color: string;
  tooltip: string;
}) {
  const radius = 18;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center" title={tooltip}>
      <svg width={44} height={44} className="-rotate-90">
        <circle
          cx={22}
          cy={22}
          r={radius}
          fill="none"
          stroke="#313244"
          strokeWidth={stroke}
        />
        <circle
          cx={22}
          cy={22}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ width: 44, height: 44 }}
      >
        <span className="text-[10px] font-bold font-mono text-gray-300">
          {value}%
        </span>
      </div>
      <span className="text-[9px] font-medium text-gray-500 -mt-1">
        {label}
      </span>
    </div>
  );
}

export default function Sidebar({
  services,
  activeServiceId,
  onSelectService,
  onAddService,
  onRemoveService,
  onEditService,
}: SidebarProps) {
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

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    service: Service;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, service: Service) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.right + 8, y: rect.top, service });
    // Temporarily hide the BrowserView so the context menu is visible
    window.electronAPI?.setActiveViewVisible(false);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    window.electronAPI?.setActiveViewVisible(true);
  };

  return (
    <>
      <div
        className="w-17 bg-sidebar flex flex-col items-center pb-4 shrink-0 overflow-y-auto"
        style={{ gap: 8, paddingTop: 8 }}
      >
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => onSelectService(service.id)}
            onContextMenu={(e) => handleContextMenu(e, service)}
            className={`
              relative w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-200 group cursor-pointer
              ${
                activeServiceId === service.id
                  ? "bg-accent/20 ring-2 ring-accent"
                  : "hover:bg-sidebar-hover"
              }
            `}
            title={service.name}
          >
            {(() => {
              const resolved = resolveIcon(service.icon, service.name);
              if (resolved) {
                return (
                  <img
                    src={resolved}
                    alt={service.name}
                    className="w-7 h-7 rounded object-contain"
                  />
                );
              }
              if (service.icon) {
                return <span className="text-2xl">{service.icon}</span>;
              }
              return (
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: service.color || "#6c7086" }}
                >
                  {service.name.charAt(0).toUpperCase()}
                </span>
              );
            })()}

            {/* Notification badge */}
            {service.notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {service.notificationCount > 99
                  ? "99+"
                  : service.notificationCount}
              </span>
            )}

            {/* Active indicator */}
            {activeServiceId === service.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent rounded-r-full" />
            )}
          </button>
        ))}

        {/* Add button */}
        <button
          onClick={onAddService}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-sidebar-hover transition-all duration-200 border-2 border-dashed border-gray-600 hover:border-accent mt-1 cursor-pointer"
          title="Add service"
        >
          <span className="text-2xl leading-none">+</span>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* System stats */}
        {stats && (
          <div
            className="flex flex-col items-center gap-2"
            style={{ marginBottom: 16 }}
          >
            <StatRing
              label="CPU"
              value={stats.cpu}
              color={getStatColor(stats.cpu)}
              tooltip={`CPU: ${stats.cpu}%`}
            />
            <StatRing
              label="MEM"
              value={Math.round((stats.memUsed / stats.memTotal) * 100)}
              color={getStatColor(
                Math.round((stats.memUsed / stats.memTotal) * 100),
              )}
              tooltip={`Memory: ${stats.memUsed} / ${stats.memTotal} MB`}
            />
            <div
              className="flex flex-col items-center"
              title={`App: ${stats.appMem} MB`}
            >
              <span className="text-[10px] font-medium text-[#89b4fa]">
                APP
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                {stats.appMem}M
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={closeContextMenu}
          />
          <div
            className="fixed bg-[#1e1e2e] rounded-xl shadow-2xl border border-[#45475a]"
            style={{
              zIndex: 9999,
              left: contextMenu.x,
              top: contextMenu.y,
              minWidth: 180,
              padding: "6px",
            }}
          >
            <button
              className="w-full text-left text-sm text-gray-200 hover:bg-[#313244] transition-colors rounded-lg cursor-pointer"
              style={{ padding: "10px 14px" }}
              onClick={() => {
                onEditService(contextMenu.service);
                closeContextMenu();
              }}
            >
              Edit service
            </button>
            <button
              className="w-full text-left text-sm text-gray-200 hover:bg-[#313244] transition-colors rounded-lg cursor-pointer"
              style={{ padding: "10px 14px" }}
              onClick={() => {
                window.electronAPI?.reloadService(contextMenu.service.id);
                closeContextMenu();
              }}
            >
              Reload
            </button>
            <div style={{ borderTop: "1px solid #313244", margin: "4px 0" }} />
            <button
              className="w-full text-left text-sm text-red-400 hover:bg-[#313244] transition-colors rounded-lg cursor-pointer"
              style={{ padding: "10px 14px" }}
              onClick={() => {
                onRemoveService(contextMenu.service.id);
                closeContextMenu();
              }}
            >
              Remove service
            </button>
          </div>
        </>
      )}
    </>
  );
}
