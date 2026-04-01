import { useState, useEffect, useRef, useCallback } from "react";
import { Service } from "../types";
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
  onToggleMuteService: (serviceId: string) => void;
  onToggleServiceEnabled: (serviceId: string) => void;
  onToggleServiceNotifications: (serviceId: string) => void;
}

export default function Sidebar({
  services,
  activeServiceId,
  onSelectService,
  onAddService,
  onRemoveService,
  onEditService,
  onReorderServices,
  onToggleMuteService,
  onToggleServiceEnabled,
  onToggleServiceNotifications,
}: SidebarProps) {
  const notificationCounts = useNotificationStore((s) => s.counts);
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

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    service: Service;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, service: Service) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.right + 8, y: rect.top, service });
    // Bring React UI layer above service views so the context menu is visible
    window.electronAPI?.bringUiToFront();
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    window.electronAPI?.sendUiToBack();
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
              ${service.enabled === false ? "opacity-30 grayscale" : ""}
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
              minWidth: 200,
              padding: "6px",
            }}
          >
            {/* Service name header */}
            <div
              className="text-sm font-semibold"
              style={{ padding: "8px 14px", color: "var(--text-primary)" }}
            >
              {contextMenu.service.name}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

            {/* Enabled toggle */}
            <div
              className="flex items-center justify-between rounded-lg"
              style={{ padding: "8px 14px" }}
            >
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Enabled</span>
              <button
                className="relative cursor-pointer"
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: contextMenu.service.enabled !== false ? "var(--accent)" : "var(--border)",
                  border: "none",
                  transition: "background-color 0.2s",
                }}
                onClick={() => {
                  onToggleServiceEnabled(contextMenu.service.id);
                  setContextMenu((prev) => prev ? {
                    ...prev,
                    service: { ...prev.service, enabled: prev.service.enabled === false },
                  } : null);
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: contextMenu.service.enabled !== false ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>

            {/* Sound toggle */}
            <div
              className="flex items-center justify-between rounded-lg"
              style={{ padding: "8px 14px" }}
            >
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Sound</span>
              <button
                className="relative cursor-pointer"
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: !contextMenu.service.muted ? "var(--accent)" : "var(--border)",
                  border: "none",
                  transition: "background-color 0.2s",
                }}
                onClick={() => {
                  onToggleMuteService(contextMenu.service.id);
                  setContextMenu((prev) => prev ? {
                    ...prev,
                    service: { ...prev.service, muted: !prev.service.muted },
                  } : null);
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: !contextMenu.service.muted ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>

            {/* Notifications toggle */}
            <div
              className="flex items-center justify-between rounded-lg"
              style={{ padding: "8px 14px" }}
            >
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Notifications</span>
              <button
                className="relative cursor-pointer"
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: contextMenu.service.notificationsEnabled !== false ? "var(--accent)" : "var(--border)",
                  border: "none",
                  transition: "background-color 0.2s",
                }}
                onClick={() => {
                  onToggleServiceNotifications(contextMenu.service.id);
                  setContextMenu((prev) => prev ? {
                    ...prev,
                    service: { ...prev.service, notificationsEnabled: prev.service.notificationsEnabled === false },
                  } : null);
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: contextMenu.service.notificationsEnabled !== false ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />

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
