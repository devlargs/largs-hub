import { IoAdd } from "react-icons/io5";
import serviceIcons from "../../assets/serviceIcons";
import type { ServicePreset } from "../../lib/serviceDraft";

interface PresetGridProps {
  search: string;
  onSearchChange: (search: string) => void;
  presets: ServicePreset[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onCustom: () => void;
}

// Add mode: the search bar, the preset tiles and the Custom tile.
export default function PresetGrid({
  search,
  onSearchChange,
  presets,
  selectedIndex,
  onSelect,
  onCustom,
}: PresetGridProps) {
  return (
    <>
      <div
        className="flex items-center rounded-xl"
        style={{
          padding: "10px 16px",
          marginBottom: 28,
          gap: 10,
          backgroundColor: "var(--panel)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search for a service..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-transparent text-sm outline-none flex-1"
          style={
            {
              color: "var(--text-primary)",
              "--tw-placeholder-color": "var(--text-muted)",
            } as React.CSSProperties
          }
        />
      </div>

      <div
        className="grid grid-cols-5 overflow-y-auto"
        style={{ gap: "20px 16px", marginBottom: 28, minHeight: 0 }}
      >
        {presets.map((preset, i) => {
          const selected = selectedIndex === i;
          return (
            <button
              key={preset.name}
              onClick={() => onSelect(i)}
              className="flex flex-col items-center cursor-pointer group"
              style={{ gap: 10 }}
            >
              <div
                className="flex items-center justify-center rounded-2xl transition-colors"
                style={{
                  width: 72,
                  height: 72,
                  background: selected
                    ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                    : "var(--panel)",
                  border: selected ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                <img
                  src={serviceIcons[preset.icon]}
                  alt={preset.name}
                  style={{ width: 40, height: 40, objectFit: "contain" }}
                />
              </div>
              <span
                className="transition-colors"
                style={{
                  fontSize: 12,
                  color: selected ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {preset.name}
              </span>
            </button>
          );
        })}

        {/* Anything not in the list — the whole point of a workspace browser,
            and previously only reachable by adding a preset and editing it
            afterwards (issue #77). */}
        <button
          onClick={onCustom}
          className="flex flex-col items-center cursor-pointer group"
          style={{ gap: 10 }}
        >
          <div
            className="flex items-center justify-center rounded-2xl transition-colors"
            style={{
              width: 72,
              height: 72,
              background: "transparent",
              border: "2px dashed var(--border)",
              color: "var(--text-muted)",
            }}
          >
            <IoAdd size={32} />
          </div>
          <span className="transition-colors" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Custom
          </span>
        </button>
      </div>

      {presets.length === 0 && search.trim().length > 0 && (
        <p
          className="text-xs text-center"
          style={{ color: "var(--text-muted)", marginTop: -12, marginBottom: 20 }}
        >
          No preset matches “{search.trim()}” — use Custom to add it by address.
        </p>
      )}
    </>
  );
}
