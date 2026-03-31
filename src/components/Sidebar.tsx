import { useState } from "react";
import { Service } from "../types";
import { resolveIcon } from "../assets/serviceIcons";

interface SidebarProps {
  services: Service[];
  activeServiceId: string | null;
  onSelectService: (id: string) => void;
  onAddService: () => void;
  onRemoveService: (id: string) => void;
  onEditService: (service: Service) => void;
}

export default function Sidebar({
  services,
  activeServiceId,
  onSelectService,
  onAddService,
  onRemoveService,
  onEditService,
}: SidebarProps) {
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
      <div className="w-[68px] bg-sidebar flex flex-col items-center py-2 gap-1 shrink-0 overflow-y-auto">
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => onSelectService(service.id)}
            onContextMenu={(e) => handleContextMenu(e, service)}
            className={`
              relative w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-200 group
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
                return <img src={resolved} alt={service.name} className="w-7 h-7 rounded object-contain" />;
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
          className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-sidebar-hover transition-all duration-200 border-2 border-dashed border-gray-600 hover:border-accent mt-1"
          title="Add service"
        >
          <span className="text-2xl leading-none">+</span>
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
