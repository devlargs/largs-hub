import { useState } from "react";
import { Service } from "../types";
import { v4 as uuidv4 } from "uuid";
import serviceIcons from "../assets/serviceIcons";

const POPULAR_SERVICES = [
  { name: "Gmail", url: "https://mail.google.com", icon: "gmail.png" },
  { name: "Slack", url: "https://app.slack.com", icon: "slack.png" },
  { name: "Discord", url: "https://discord.com/app", icon: "discord.png" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", icon: "whatsapp.png" },
  { name: "Telegram", url: "https://web.telegram.org", icon: "telegram.png" },
  { name: "Notion", url: "https://www.notion.so", icon: "notion.png" },
  { name: "Twitter / X", url: "https://x.com", icon: "x.png" },
  { name: "Reddit", url: "https://reddit.com", icon: "reddit.png" },
  { name: "LinkedIn", url: "https://linkedin.com", icon: "linkedin.png" },
  {
    name: "Messenger",
    url: "https://www.messenger.com",
    icon: "messenger.png",
  },
];

interface AddServiceModalProps {
  editingService: Service | null;
  onSubmit: (service: Service) => void;
  onClose: () => void;
}

export default function AddServiceModal({
  onSubmit,
  onClose,
}: AddServiceModalProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const filtered = POPULAR_SERVICES.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleConfirm = () => {
    if (selectedIndex === null) return;
    const preset = filtered[selectedIndex];
    if (!preset) return;
    onSubmit({
      id: uuidv4(),
      name: preset.name,
      url: preset.url,
      icon: preset.icon,
      color: "#06b6d4",
      notificationCount: 0,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-sidebar rounded-3xl shadow-2xl mx-4"
        style={{
          width: 600,
          maxHeight: "90vh",
          padding: "40px 40px 40px",
          display: "flex",
          flexDirection: "column" as const,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h2
          className="text-white text-center"
          style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}
        >
          Add a service to your workspace
        </h2>

        {/* Search bar */}
        <div
          className="flex items-center rounded-xl bg-[#11111b]"
          style={{ padding: "10px 16px", marginBottom: 28, gap: 10 }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#585b70"
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
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(null);
            }}
            className="bg-transparent text-white text-sm outline-none flex-1 placeholder-[#585b70]"
          />
        </div>

        {/* Service grid */}
        <div
          className="grid grid-cols-5 overflow-y-auto"
          style={{ gap: "20px 16px", marginBottom: 28, minHeight: 0 }}
        >
          {filtered.map((preset, i) => (
            <button
              key={preset.name}
              onClick={() => setSelectedIndex(i)}
              className="flex flex-col items-center cursor-pointer group"
              style={{ gap: 10 }}
            >
              <div
                className="flex items-center justify-center rounded-2xl transition-colors"
                style={{
                  width: 72,
                  height: 72,
                  background:
                    selectedIndex === i ? "rgba(137,180,250,0.2)" : "#11111b",
                  border:
                    selectedIndex === i
                      ? "2px solid #89b4fa"
                      : "2px solid transparent",
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
                  color: selectedIndex === i ? "#cdd6f4" : "#6c7086",
                }}
              >
                {preset.name}
              </span>
            </button>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end" style={{ gap: 12 }}>
          <button
            onClick={onClose}
            className="text-sm cursor-pointer transition-colors"
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              background: "transparent",
              border: "1px solid #45475a",
              color: "#a6adc8",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIndex === null}
            className="text-sm font-semibold cursor-pointer transition-all"
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              background:
                selectedIndex !== null ? "#89b4fa" : "rgba(137,180,250,0.3)",
              border: "none",
              color: selectedIndex !== null ? "#1e1e2e" : "#a6adc8",
              opacity: selectedIndex === null ? 0.5 : 1,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
