import { useMemo } from "react";
import { Service } from "../types";
import { IoHome } from "react-icons/io5";
import { useNotificationStore } from "../store/notifications";
import { SIDEBAR_WIDTH } from "@shared/layout";
import { moveBy } from "../lib/serviceOrder";
import { useServiceDrag } from "../hooks/useServiceDrag";
import ServiceButton from "./sidebar/ServiceButton";
import ThemeToggle from "./sidebar/ThemeToggle";

interface SidebarProps {
  services: Service[];
  activeServiceId: string | null;
  // Ctrl is held: number the services Ctrl+1-9 would switch to
  showShortcutHints: boolean;
  onSelectService: (id: string) => void;
  onAddService: () => void;
  onReorderServices: (serviceIds: string[]) => void;
}

export default function Sidebar({
  services,
  activeServiceId,
  showShortcutHints,
  onSelectService,
  onAddService,
  onReorderServices,
}: SidebarProps) {
  const notificationCounts = useNotificationStore((s) => s.counts);
  const serviceIds = useMemo(() => services.map((s) => s.id), [services]);
  const drag = useServiceDrag(serviceIds, onReorderServices);

  // Reordering was pointer-only: a 300ms long-press then a drag, with no
  // keyboard route at all (issue #88). Alt+Up/Down moves the focused service.
  const handleServiceKeyDown = (e: React.KeyboardEvent, serviceId: string) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const reordered = moveBy(serviceIds, serviceId, e.key === "ArrowUp" ? -1 : 1);
    if (reordered) onReorderServices(reordered);
    // Keep focus on the button that moved, which React has just re-rendered
    // into a new position.
    const button = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => button.focus());
  };

  return (
    <div
      className="bg-sidebar flex flex-col items-center pb-4 shrink-0 overflow-y-auto"
      // Width comes from the shared constant main positions service views
      // against, rather than a Tailwind class that could drift from it.
      style={{ width: SIDEBAR_WIDTH, gap: 8, paddingTop: 8 }}
    >
      {/* Home button */}
      <button
        onClick={onAddService}
        className={`
          w-12 h-12 rounded-xl flex items-center justify-center
          transition-all duration-200 cursor-pointer
          ${!activeServiceId ? "bg-accent/20 ring-2 ring-accent" : "hover:bg-sidebar-hover"}
        `}
        aria-label="Home"
        title="Home"
        style={{ color: !activeServiceId ? "var(--accent)" : "var(--text-muted)" }}
      >
        <IoHome size={22} />
      </button>

      {services.map((service, index) => (
        <ServiceButton
          key={service.id}
          service={service}
          index={index}
          active={activeServiceId === service.id}
          unread={notificationCounts[service.id] ?? 0}
          showShortcutHint={showShortcutHints}
          dragging={drag.draggedId === service.id}
          dropTarget={drag.dropTargetId === service.id}
          dragProps={drag.dragProps(service.id)}
          onClick={() => {
            if (!drag.wasDrag()) onSelectService(service.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            window.electronAPI?.showServiceContextMenu(service.id);
          }}
          onKeyDown={(e) => handleServiceKeyDown(e, service.id)}
        />
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      <ThemeToggle />
    </div>
  );
}
