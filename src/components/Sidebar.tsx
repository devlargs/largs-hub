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
    setContextMenu({ x: e.clientX, y: e.clientY, service });
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
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-[#313244] rounded-lg shadow-xl border border-[#45475a] py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-[#45475a] transition-colors"
              onClick={() => {
                onEditService(contextMenu.service);
                setContextMenu(null);
              }}
            >
              Edit service
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-[#45475a] transition-colors"
              onClick={() => {
                window.electronAPI?.reloadService(contextMenu.service.id);
                setContextMenu(null);
              }}
            >
              Reload
            </button>
            <div className="border-t border-[#45475a] my-1" />
            <button
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-[#45475a] transition-colors"
              onClick={() => {
                onRemoveService(contextMenu.service.id);
                setContextMenu(null);
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
