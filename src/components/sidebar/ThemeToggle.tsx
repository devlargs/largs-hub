import { useEffect, useState } from "react";
import { IoMoon, IoSunny } from "react-icons/io5";

// Dark / light switch at the foot of the sidebar. Main stores the choice; the
// `.light` class on the root element swaps the CSS variables.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

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

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      onClick={toggleTheme}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer hover:bg-sidebar-hover"
      style={{ color: "var(--text-muted)", marginBottom: 4 }}
      aria-pressed={theme === "light"}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? <IoSunny size={18} /> : <IoMoon size={18} />}
    </button>
  );
}
