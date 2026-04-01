import { useState, useEffect, useCallback } from "react";
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
  editingService,
  onSubmit,
  onClose,
}: AddServiceModalProps) {
  const isEditing = !!editingService;
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState(editingService?.name || "");
  const [editUrl, setEditUrl] = useState(editingService?.url || "");
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const filtered = POPULAR_SERVICES.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleConfirm = () => {
    if (isEditing) {
      if (!editName.trim() || !editUrl.trim()) return;
      onSubmit({
        ...editingService!,
        name: editName.trim(),
        url: editUrl.trim(),
      });
    } else {
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
    }
  };

  const canConfirm = isEditing
    ? editName.trim().length > 0 && editUrl.trim().length > 0
    : selectedIndex !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ease-out"
      style={{
        backgroundColor: visible && !closing ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)",
        backdropFilter: visible && !closing ? "blur(4px)" : "blur(0px)",
      }}
      onClick={handleClose}
    >
      <div
        className="bg-sidebar rounded-3xl shadow-2xl mx-4 transition-all duration-200 ease-out"
        style={{
          width: 600,
          maxHeight: "90vh",
          padding: "40px 40px 40px",
          display: "flex",
          flexDirection: "column" as const,
          opacity: visible && !closing ? 1 : 0,
          transform: visible && !closing ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h2
          className="text-center"
          style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: "var(--text-primary)" }}
        >
          {isEditing ? "Edit service" : "Add a service to your workspace"}
        </h2>

        {isEditing ? (
          /* Edit form */
          <div className="flex flex-col" style={{ gap: 16, marginBottom: 28 }}>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-sm outline-none rounded-xl"
                style={{
                  padding: "10px 16px",
                  backgroundColor: "var(--panel)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
            <div className="flex flex-col" style={{ gap: 6 }}>
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>URL</label>
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="text-sm outline-none rounded-xl"
                style={{
                  padding: "10px 16px",
                  backgroundColor: "var(--panel)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
          </div>
        ) : (
          /* Add mode: search + grid */
          <>
            {/* Search bar */}
            <div
              className="flex items-center rounded-xl"
              style={{ padding: "10px 16px", marginBottom: 28, gap: 10, backgroundColor: "var(--panel)" }}
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(null);
                }}
                className="bg-transparent text-sm outline-none flex-1"
                style={{ color: "var(--text-primary)", "--tw-placeholder-color": "var(--text-muted)" } as React.CSSProperties}
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
                        selectedIndex === i ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--panel)",
                      border:
                        selectedIndex === i
                          ? "2px solid var(--accent)"
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
                      color: selectedIndex === i ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Footer buttons */}
        <div className="flex justify-end" style={{ gap: 12 }}>
          <button
            onClick={handleClose}
            className="text-sm cursor-pointer transition-colors"
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="text-sm font-semibold cursor-pointer transition-all"
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              background:
                canConfirm ? "var(--accent)" : "color-mix(in srgb, var(--accent) 30%, transparent)",
              border: "none",
              color: canConfirm ? "var(--surface)" : "var(--text-secondary)",
              opacity: canConfirm ? 1 : 0.5,
            }}
          >
            {isEditing ? "Save" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
