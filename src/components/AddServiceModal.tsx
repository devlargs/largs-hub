import { useState, useEffect, useRef } from "react";
import { InternalServiceType, Service } from "../types";
import { normalizeServiceUrl, serviceNameFromUrl } from "../lib/serviceUrl";
import { sortByName } from "../lib/serviceOrder";
import Modal from "./ui/Modal";
import IconCropper from "./IconCropper";
import { v4 as uuidv4 } from "uuid";
import serviceIcons, { resolveIcon } from "../assets/serviceIcons";
import { IoAdd, IoCloudUploadOutline, IoTrashOutline } from "react-icons/io5";

// Sorted by name below, so the grid reads alphabetically however this literal
// happens to be ordered (issue #100). The Custom tile isn't in here — it is
// appended after the presets in the grid itself.
const POPULAR_SERVICES: {
  name: string;
  url: string;
  icon: string;
  type?: InternalServiceType;
}[] = sortByName([
  { name: "Gmail", url: "https://mail.google.com", icon: "gmail.png" },
  { name: "Slack", url: "https://app.slack.com", icon: "slack.png" },
  { name: "Discord", url: "https://discord.com/app", icon: "discord.png" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", icon: "whatsapp.png" },
  { name: "Telegram", url: "https://web.telegram.org", icon: "telegram.png" },
  { name: "Notion", url: "https://www.notion.so", icon: "notion.png" },
  {
    name: "Todo",
    url: "todo://internal",
    icon: "todo.svg",
    type: "todo",
  },
  { name: "Twitter / X", url: "https://x.com", icon: "x.png" },
  { name: "Reddit", url: "https://reddit.com", icon: "reddit.png" },
  { name: "LinkedIn", url: "https://linkedin.com", icon: "linkedin.png" },
  {
    name: "Messenger",
    url: "https://www.messenger.com",
    icon: "messenger.png",
  },
  { name: "Google Chat", url: "https://chat.google.com", icon: "googlechat.svg" },
]);

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
  const [editIcon, setEditIcon] = useState(editingService?.icon || "");
  const [iconPreview, setIconPreview] = useState<string | null>(() => {
    if (editingService?.icon) {
      return resolveIcon(editingService.icon, editingService.name) || null;
    }
    return null;
  });
  const [urlError, setUrlError] = useState<string | null>(null);
  // Add mode has two faces: pick a preset, or fill in the same name/URL/icon
  // form the edit mode uses. Without this, the only way to run anything outside
  // the preset list was to add a preset and edit it afterwards (issue #77).
  const [customMode, setCustomMode] = useState(false);
  // True once the name has been typed in, so deriving it from the URL host
  // stops overwriting what the user wrote.
  const nameTouched = useRef(false);
  // A picked file waiting to be cropped, as a data URL. Nothing is written to
  // disk until the crop is accepted (issue #101).
  const [cropSource, setCropSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Icons uploaded while this modal has been open. Each one is a file on disk
  // the moment it's picked, but only the last is kept — the rest (and all of
  // them, if the modal is cancelled) would otherwise be orphaned (issue #70).
  const sessionUploads = useRef<string[]>([]);
  const submitted = useRef(false);

  // Closing without saving leaves whatever was uploaded unreferenced, so remove
  // it. Runs on unmount, which covers Cancel, the backdrop and Escape alike.
  useEffect(() => {
    return () => {
      if (submitted.current) return;
      for (const fileName of sessionUploads.current) {
        void window.electronAPI?.deleteCustomIcon(fileName);
      }
    };
  }, []);

  const filtered = POPULAR_SERVICES.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Picking a file only opens the cropper; a cancelled crop leaves the previous
  // icon (and the disk) untouched.
  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result as string);
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  // The cropper hands back a PNG square, whatever went in.
  const handleCropApply = async (dataUrl: string) => {
    setCropSource(null);
    setIconPreview(dataUrl);
    const fileName = `${uuidv4()}.png`;
    await window.electronAPI.saveCustomIcon(fileName, dataUrl);
    // Anything uploaded earlier in this session is now unreachable — the
    // service's own saved icon is left alone, main handles that on save.
    for (const stale of sessionUploads.current) {
      void window.electronAPI.deleteCustomIcon(stale);
    }
    sessionUploads.current = [fileName];
    setEditIcon(`custom:${fileName}`);
  };

  // Typing "app.slack.com" should not also mean typing "Slack" — derive a
  // reasonable name from the host until the name field is touched.
  const handleCustomUrlChange = (value: string) => {
    setEditUrl(value);
    if (urlError) setUrlError(null);
    if (!customMode || isEditing || nameTouched.current) return;
    const derived = serviceNameFromUrl(value);
    if (derived) setEditName(derived);
  };

  const handleDeleteIcon = async () => {
    if (editIcon.startsWith("custom:")) {
      const fileName = editIcon.slice(7);
      await window.electronAPI.deleteCustomIcon(fileName);
      sessionUploads.current = sessionUploads.current.filter((f) => f !== fileName);
    }
    setEditIcon("");
    setIconPreview(null);
  };

  const handleConfirm = () => {
    submitted.current = true;
    if (customMode && !isEditing) {
      const url = normalizeServiceUrl(editUrl);
      if (!editName.trim() || !url) {
        setUrlError("Enter a web address like https://example.com");
        submitted.current = false;
        return;
      }
      setUrlError(null);
      onSubmit({
        id: uuidv4(),
        name: editName.trim(),
        url,
        icon: editIcon,
        color: "#06b6d4",
        notificationCount: 0,
      });
      return;
    }
    if (isEditing) {
      if (!editName.trim() || !editUrl.trim()) {
        submitted.current = false;
        return;
      }
      // Internal services (Todo) carry a non-http URL that is never edited
      const url = editingService!.type ? editingService!.url : normalizeServiceUrl(editUrl);
      if (!url) {
        // The main process would reject this and hand back the unchanged list,
        // which the renderer can't tell apart from a successful save (#78)
        setUrlError("Enter a web address like https://example.com");
        submitted.current = false;
        return;
      }
      setUrlError(null);
      onSubmit({
        ...editingService!,
        name: editName.trim(),
        url,
        icon: editIcon || editingService!.icon,
      });
    } else {
      if (selectedIndex === null || !filtered[selectedIndex]) {
        submitted.current = false;
        return;
      }
      const preset = filtered[selectedIndex];
      onSubmit({
        id: uuidv4(),
        name: preset.name,
        url: preset.url,
        icon: editIcon || preset.icon,
        color: "#06b6d4",
        notificationCount: 0,
        ...(preset.type ? { type: preset.type } : {}),
      });
    }
  };

  // The name/URL/icon form backs both editing and adding a custom service.
  const showForm = isEditing || customMode;
  const canConfirm = showForm
    ? editName.trim().length > 0 && editUrl.trim().length > 0
    : selectedIndex !== null;

  return (
    <>
      <Modal
        label={isEditing ? "Edit service" : "Add a service"}
        onClose={onClose}
        width={600}
        maxHeight="90vh"
        padding={40}
        // The cropper opens on top and owns both while it's up: Escape should
        // back out of the crop, not throw away the form behind it.
        closeOnEscape={cropSource === null}
        trapFocus={cropSource === null}
      >
        {(close) => (
          <>
            {/* Title */}
            <h2
              className="text-center"
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 24,
                color: "var(--text-primary)",
              }}
            >
              {isEditing
                ? "Edit service"
                : customMode
                  ? "Add a custom service"
                  : "Add a service to your workspace"}
            </h2>

            {showForm ? (
              /* Name / URL / icon form — editing, or adding a custom service */
              <div className="flex flex-col" style={{ gap: 16, marginBottom: 28 }}>
                {/* Icon upload */}
                <div className="flex flex-col items-center" style={{ gap: 8 }}>
                  <label
                    className="text-xs font-medium self-start"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Icon
                  </label>
                  <div className="flex items-center" style={{ gap: 12 }}>
                    <div
                      className="flex items-center justify-center rounded-2xl"
                      style={{
                        width: 64,
                        height: 64,
                        backgroundColor: "var(--panel)",
                        border: "1px solid var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt="Icon"
                          style={{ width: 40, height: 40, objectFit: "contain" }}
                        />
                      ) : (
                        <span
                          className="flex items-center justify-center text-white font-bold text-lg"
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            backgroundColor: editingService?.color || "#6c7086",
                          }}
                        >
                          {editName.charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col" style={{ gap: 6 }}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center text-xs font-medium cursor-pointer rounded-lg transition-colors hover:opacity-80"
                        style={{
                          gap: 6,
                          padding: "6px 12px",
                          backgroundColor: "var(--panel)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <IoCloudUploadOutline size={14} />
                        Upload
                      </button>
                      {iconPreview && editIcon.startsWith("custom:") && (
                        <button
                          onClick={handleDeleteIcon}
                          className="flex items-center text-xs font-medium cursor-pointer rounded-lg transition-colors hover:opacity-80"
                          style={{
                            gap: 6,
                            padding: "6px 12px",
                            color: "#f38ba8",
                            backgroundColor: "transparent",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <IoTrashOutline size={14} />
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleIconUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="flex flex-col" style={{ gap: 6 }}>
                  <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      nameTouched.current = true;
                      setEditName(e.target.value);
                    }}
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
                  <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    URL
                  </label>
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => handleCustomUrlChange(e.target.value)}
                    placeholder="https://example.com"
                    aria-invalid={urlError !== null}
                    className="text-sm outline-none rounded-xl"
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "var(--panel)",
                      color: "var(--text-primary)",
                      border: `1px solid ${urlError ? "var(--danger)" : "var(--border)"}`,
                    }}
                  />
                  {urlError && (
                    <span className="text-xs" style={{ color: "var(--danger)" }}>
                      {urlError}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* Add mode: search + grid */
              <>
                {/* Search bar */}
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
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedIndex(null);
                    }}
                    className="bg-transparent text-sm outline-none flex-1"
                    style={
                      {
                        color: "var(--text-primary)",
                        "--tw-placeholder-color": "var(--text-muted)",
                      } as React.CSSProperties
                    }
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
                            selectedIndex === i
                              ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                              : "var(--panel)",
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

                  {/* Anything not in the list — the whole point of a workspace
                  browser, and previously only reachable by adding a preset and
                  editing it afterwards (issue #77). */}
                  <button
                    onClick={() => {
                      setSelectedIndex(null);
                      setUrlError(null);
                      // Carry the search text over: someone who typed a URL into
                      // the filter and found nothing was already halfway here.
                      if (search.trim()) handleCustomUrlChange(search.trim());
                      setCustomMode(true);
                    }}
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
                    <span
                      className="transition-colors"
                      style={{ fontSize: 12, color: "var(--text-muted)" }}
                    >
                      Custom
                    </span>
                  </button>
                </div>

                {filtered.length === 0 && search.trim().length > 0 && (
                  <p
                    className="text-xs text-center"
                    style={{ color: "var(--text-muted)", marginTop: -12, marginBottom: 20 }}
                  >
                    No preset matches “{search.trim()}” — use Custom to add it by address.
                  </p>
                )}
              </>
            )}

            {/* Footer buttons */}
            <div className="flex justify-end" style={{ gap: 12 }}>
              <button
                onClick={() => {
                  // From the custom form, Cancel steps back to the preset grid
                  // rather than throwing away the whole modal.
                  if (customMode && !isEditing) {
                    setCustomMode(false);
                    setUrlError(null);
                    return;
                  }
                  close();
                }}
                className="text-sm cursor-pointer transition-colors"
                style={{
                  padding: "10px 24px",
                  borderRadius: 12,
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {customMode && !isEditing ? "Back" : "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="text-sm font-semibold cursor-pointer transition-all"
                style={{
                  padding: "10px 24px",
                  borderRadius: 12,
                  background: canConfirm
                    ? "var(--accent)"
                    : "color-mix(in srgb, var(--accent) 30%, transparent)",
                  border: "none",
                  color: canConfirm ? "var(--surface)" : "var(--text-secondary)",
                  opacity: canConfirm ? 1 : 0.5,
                }}
              >
                {isEditing ? "Save" : customMode ? "Add service" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </Modal>
      {/* Outside the modal above, whose backdrop click closes the whole form. */}
      {cropSource && (
        <IconCropper
          source={cropSource}
          onCancel={() => setCropSource(null)}
          onApply={handleCropApply}
        />
      )}
    </>
  );
}
