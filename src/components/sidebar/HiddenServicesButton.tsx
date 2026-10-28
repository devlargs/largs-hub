import { IoEyeOff } from "react-icons/io5";

// Above the lock: opens the native Hidden Services menu (Open / Unhide per
// service). Only shown while something is hidden. Lit like an active service
// while a hidden service is the one on screen, since it has no sidebar button.
export default function HiddenServicesButton({ active }: { active: boolean }) {
  return (
    <button
      onClick={() => window.electronAPI?.showHiddenServicesMenu()}
      className={`
        w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer
        ${active ? "bg-accent/20 ring-2 ring-accent" : "hover:bg-sidebar-hover"}
      `}
      style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
      aria-label="Hidden services"
      aria-haspopup="menu"
      title="Hidden services"
    >
      <IoEyeOff size={18} />
    </button>
  );
}
