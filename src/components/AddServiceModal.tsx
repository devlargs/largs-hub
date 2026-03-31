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
  { name: "Messenger", url: "https://www.messenger.com", icon: "messenger.png" },
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
  const handlePresetClick = (preset: (typeof POPULAR_SERVICES)[0]) => {
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
        className="bg-[#1e1e2e] rounded-3xl shadow-2xl w-[520px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-10">
          <p className="text-sm text-gray-400 mb-6">
            Add a service to your workspace
          </p>

          <div className="grid grid-cols-5 gap-x-2 gap-y-5">
            {POPULAR_SERVICES.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetClick(preset)}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#11111b] flex items-center justify-center group-hover:bg-[#313244] transition-colors">
                  <img
                    src={serviceIcons[preset.icon]}
                    alt={preset.name}
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <span className="text-[11px] text-gray-500 group-hover:text-gray-300 transition-colors">
                  {preset.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
