import type { Service } from "../../types";
import { resolveIcon } from "../../assets/serviceIcons";
import { badgeText, serviceLabel } from "../../lib/serviceLabel";
import type { useServiceDrag } from "../../hooks/useServiceDrag";

interface ServiceButtonProps {
  service: Service;
  // Position in the sidebar, zero-based
  index: number;
  active: boolean;
  unread: number;
  showShortcutHint: boolean;
  dragging: boolean;
  dropTarget: boolean;
  dragProps: ReturnType<ReturnType<typeof useServiceDrag>["dragProps"]>;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

// One service in the sidebar: its icon, unread badge, Ctrl+N hint and the
// active marker.
export default function ServiceButton({
  service,
  index,
  active,
  unread,
  showShortcutHint,
  dragging,
  dropTarget,
  dragProps,
  onClick,
  onContextMenu,
  onKeyDown,
}: ServiceButtonProps) {
  return (
    <button
      // Ctrl+N picks the Nth service in sidebar order, disabled ones
      // included — the same lookup main and the app shell use.
      aria-keyshortcuts={index < 9 ? `Control+${index + 1}` : undefined}
      {...dragProps}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      className={`
        relative w-12 h-12 rounded-xl flex items-center justify-center
        transition-all duration-200 group cursor-pointer
        ${active ? "bg-accent/20 ring-2 ring-accent" : "hover:bg-sidebar-hover"}
        ${dragging ? "opacity-40 scale-90" : ""}
        ${dropTarget && !dragging ? "ring-2 ring-accent/50" : ""}
        ${service.enabled === false ? "opacity-30 grayscale" : ""}
      `}
      aria-current={active}
      aria-label={serviceLabel(service, unread)}
      title={service.name}
    >
      <ServiceIcon service={service} />

      {/* Notification badge */}
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badgeText(unread)}
        </span>
      )}

      {/* Shortcut number, while Ctrl is held. Bottom-right so it never
          covers the notification count in the top-right. */}
      {showShortcutHint && index < 9 && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 rounded-md min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[11px] font-bold tabular-nums"
          style={{
            color: "var(--sidebar)",
            background: "var(--text-primary)",
            boxShadow: "0 0 0 2px var(--sidebar)",
          }}
        >
          {index + 1}
        </span>
      )}

      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent rounded-r-full" />
      )}
    </button>
  );
}

// The built-in or uploaded icon, an emoji icon, or the name's initial.
function ServiceIcon({ service }: { service: Service }) {
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
}
