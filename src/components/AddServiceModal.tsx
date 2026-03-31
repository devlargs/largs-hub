import { useState } from "react";
import { Service } from "../types";
import { v4 as uuidv4 } from "uuid";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

const POPULAR_SERVICES = [
  { name: "Gmail", url: "https://mail.google.com", icon: "📧" },
  { name: "Slack", url: "https://app.slack.com", icon: "💬" },
  { name: "Discord", url: "https://discord.com/app", icon: "🎮" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", icon: "📱" },
  { name: "Telegram", url: "https://web.telegram.org", icon: "✈️" },
  { name: "Notion", url: "https://www.notion.so", icon: "📝" },
  { name: "GitHub", url: "https://github.com", icon: "🐙" },
  { name: "Twitter / X", url: "https://x.com", icon: "🐦" },
  { name: "YouTube", url: "https://youtube.com", icon: "▶️" },
  { name: "Reddit", url: "https://reddit.com", icon: "🤖" },
  { name: "LinkedIn", url: "https://linkedin.com", icon: "💼" },
  { name: "Messenger", url: "https://www.messenger.com", icon: "💭" },
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
  const [name, setName] = useState(editingService?.name ?? "");
  const [url, setUrl] = useState(editingService?.url ?? "");
  const [icon, setIcon] = useState(editingService?.icon ?? "");
  const [color, setColor] = useState(editingService?.color ?? PRESET_COLORS[4]);
  const [showPresets, setShowPresets] = useState(!editingService);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    let finalUrl = url.trim();
    if (!/^https?:\/\//.test(finalUrl)) {
      finalUrl = "https://" + finalUrl;
    }

    onSubmit({
      id: editingService?.id ?? uuidv4(),
      name: name.trim(),
      url: finalUrl,
      icon,
      color,
      notificationCount: editingService?.notificationCount ?? 0,
    });
  };

  const handlePresetClick = (preset: (typeof POPULAR_SERVICES)[0]) => {
    setName(preset.name);
    setUrl(preset.url);
    setIcon(preset.icon);
    setShowPresets(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e2e] rounded-2xl shadow-2xl border border-[#313244] w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingService ? "Edit Service" : "Add Service"}
          </h2>

          {/* Quick presets */}
          {showPresets && !editingService && (
            <div className="mb-5">
              <p className="text-xs text-gray-400 mb-2">Quick add</p>
              <div className="grid grid-cols-4 gap-2">
                {POPULAR_SERVICES.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetClick(preset)}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-[#313244] transition-colors"
                  >
                    <span className="text-xl">{preset.icon}</span>
                    <span className="text-[10px] text-gray-400 truncate w-full text-center">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowPresets(false)}
                className="text-xs text-accent hover:underline mt-2"
              >
                Custom service...
              </button>
            </div>
          )}

          {/* Custom form */}
          {(!showPresets || editingService) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Gmail"
                  className="w-full bg-[#11111b] text-white rounded-lg px-3 py-2 text-sm border border-[#313244] focus:border-accent focus:outline-none"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g. https://mail.google.com"
                  className="w-full bg-[#11111b] text-white rounded-lg px-3 py-2 text-sm border border-[#313244] focus:border-accent focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Icon (emoji)
                </label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="e.g. 📧"
                  className="w-full bg-[#11111b] text-white rounded-lg px-3 py-2 text-sm border border-[#313244] focus:border-accent focus:outline-none"
                  maxLength={4}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c
                          ? "ring-2 ring-white ring-offset-2 ring-offset-[#1e1e2e] scale-110"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {!editingService && (
                  <button
                    type="button"
                    onClick={() => setShowPresets(true)}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Presets
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-accent text-[#1e1e2e] font-medium rounded-lg hover:brightness-110 transition-all"
                >
                  {editingService ? "Save" : "Add"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
