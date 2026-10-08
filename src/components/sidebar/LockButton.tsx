import { IoLockClosed } from "react-icons/io5";

// Lock the workspace now, at the foot of the sidebar. Only shown while
// "Add Security Controls" is on with a password set; main checks that again
// before locking, so there's always a password to get back in with.
export default function LockButton() {
  return (
    <button
      onClick={() => void window.electronAPI?.security.lockNow()}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer hover:bg-sidebar-hover"
      style={{ color: "var(--text-muted)", marginBottom: 4 }}
      aria-label="Lock workspace"
      title="Lock workspace"
    >
      <IoLockClosed size={18} />
    </button>
  );
}
