import { useState, useEffect, useRef, useCallback } from "react";
import { Service, SystemStats } from "../types";
import { resolveIcon } from "../assets/serviceIcons";
import { IoSunny, IoMoon, IoHome } from "react-icons/io5";
import { useNotificationStore } from "../store/notifications";

interface SidebarProps {
  services: Service[];
  activeServiceId: string | null;
  onSelectService: (id: string) => void;
  onAddService: () => void;
  onRemoveService: (id: string) => void;
  onEditService: (service: Service) => void;
  onReorderServices: (serviceIds: string[]) => void;
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
          stroke="var(--stat-ring-bg)"
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
        <span className="text-[10px] font-bold font-mono" style={{ color: "var(--text-primary)" }}>
          {value}%
        </span>
      </div>
      <span className="text-[9px] font-medium -mt-1" style={{ color: "var(--text-muted)" }}>
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
  onReorderServices,
}: SidebarProps) {
  const notificationCounts = useNotificationStore((s) => s.counts);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Drag and drop state
  const [dragEnabled, setDragEnabled] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDrag = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((serviceId: string) => {
    didDrag.current = false;
    longPressTimer.current = setTimeout(() => {
      setDragEnabled(true);
      setDraggedId(serviceId);
    }, 300);
  }, []);

  const handlePointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleDragStart = useCallback((e: React.DragEvent, serviceId: string) => {
    if (!dragEnabled) {
      e.preventDefault();
      return;
    }
    didDrag.current = true;
    e.dataTransfer.effectAllowed = "move";
    // Use a transparent image as drag ghost (we show our own indicator)
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
    setDraggedId(serviceId);
  }, [dragEnabled]);

  const handleDragOver = useCallback((e: React.DragEvent, serviceId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(serviceId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      setDragEnabled(false);
      return;
    }

    const oldIds = services.map((s) => s.id);
    const fromIndex = oldIds.indexOf(draggedId);
    const toIndex = oldIds.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const newIds = [...oldIds];
    newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, draggedId);
    onReorderServices(newIds);

    setDraggedId(null);
    setDropTargetId(null);
    setDragEnabled(false);
  }, [draggedId, services, onReorderServices]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
    setDragEnabled(false);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getTheme().then((t) => {
      setTheme(t);
      document.documentElement.classList.toggle("light", t === "light");
    });
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    window.electronAPI?.setTheme(next);
  };

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
        {/* Home button */}
        <button
          onClick={onAddService}
          className={`
            w-12 h-12 rounded-xl flex items-center justify-center
            transition-all duration-200 cursor-pointer
            ${!activeServiceId ? "bg-accent/20 ring-2 ring-accent" : "hover:bg-sidebar-hover"}
          `}
          title="Home"
          style={{ color: !activeServiceId ? "var(--accent)" : "var(--text-muted)" }}
        >
          <IoHome size={22} />
        </button>

        {services.map((service) => (
          <button
            key={service.id}
            draggable={dragEnabled && draggedId === service.id}
            onClick={() => {
              if (!didDrag.current) onSelectService(service.id);
            }}
            onPointerDown={() => handlePointerDown(service.id)}
            onPointerUp={handlePointerUp}
            onPointerLeave={clearLongPress}
            onDragStart={(e) => handleDragStart(e, service.id)}
            onDragOver={(e) => handleDragOver(e, service.id)}
            onDrop={(e) => handleDrop(e, service.id)}
            onDragEnd={handleDragEnd}
            onContextMenu={(e) => handleContextMenu(e, service)}
            className={`
              relative w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-200 group cursor-pointer
              ${
                activeServiceId === service.id
                  ? "bg-accent/20 ring-2 ring-accent"
                  : "hover:bg-sidebar-hover"
              }
              ${draggedId === service.id ? "opacity-40 scale-90" : ""}
              ${dropTargetId === service.id && draggedId !== service.id ? "ring-2 ring-accent/50" : ""}
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
            {(notificationCounts[service.id] || 0) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {(notificationCounts[service.id] || 0) > 99
                  ? "99+"
                  : notificationCounts[service.id]}
              </span>
            )}

            {/* Active indicator */}
            {activeServiceId === service.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent rounded-r-full" />
            )}
          </button>
        ))}

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
              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                {stats.appMem}M
              </span>
            </div>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer hover:bg-sidebar-hover"
          style={{ color: "var(--text-muted)", marginBottom: 4 }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <IoSunny size={18} /> : <IoMoon size={18} />}
        </button>
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
            className="fixed rounded-xl shadow-2xl"
            style={{
              backgroundColor: "var(--context-bg)",
              border: "1px solid var(--border)",
              zIndex: 9999,
              left: contextMenu.x,
              top: contextMenu.y,
              minWidth: 180,
              padding: "6px",
            }}
          >
            <button
              className="w-full text-left text-sm transition-colors rounded-lg cursor-pointer"
              style={{ padding: "10px 14px", color: "var(--text-primary)" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--context-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              onClick={() => {
                onEditService(contextMenu.service);
                closeContextMenu();
              }}
            >
              Edit service
            </button>
            <button
              className="w-full text-left text-sm transition-colors rounded-lg cursor-pointer"
              style={{ padding: "10px 14px", color: "var(--text-primary)" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--context-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              onClick={() => {
                window.electronAPI?.reloadService(contextMenu.service.id);
                closeContextMenu();
              }}
            >
              Reload
            </button>
            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
            <button
              className="w-full text-left text-sm text-red-400 transition-colors rounded-lg cursor-pointer"
              style={{ padding: "10px 14px" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--context-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
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
