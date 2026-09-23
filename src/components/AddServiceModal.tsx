import { useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Service } from "../types";
import { serviceNameFromUrl } from "../lib/serviceUrl";
import { DraftMode, canConfirmDraft, filterPresets, resolveDraft } from "../lib/serviceDraft";
import Modal from "./ui/Modal";
import IconCropper from "./IconCropper";
import { useServiceIcon } from "./add-service/useServiceIcon";
import ServiceForm from "./add-service/ServiceForm";
import PresetGrid from "./add-service/PresetGrid";

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
  const [urlError, setUrlError] = useState<string | null>(null);
  // Add mode has two faces: pick a preset, or fill in the same name/URL/icon
  // form the edit mode uses. Without this, the only way to run anything outside
  // the preset list was to add a preset and edit it afterwards (issue #77).
  const [customMode, setCustomMode] = useState(false);
  // True once the name has been typed in, so deriving it from the URL host
  // stops overwriting what the user wrote.
  const nameTouched = useRef(false);
  const iconState = useServiceIcon(editingService);

  const filtered = filterPresets(search);
  const mode: DraftMode = isEditing ? "edit" : customMode ? "custom" : "preset";
  const preset = selectedIndex !== null ? (filtered[selectedIndex] ?? null) : null;

  // Typing "app.slack.com" should not also mean typing "Slack" — derive a
  // reasonable name from the host until the name field is touched.
  const handleCustomUrlChange = (value: string) => {
    setEditUrl(value);
    if (urlError) setUrlError(null);
    if (!customMode || isEditing || nameTouched.current) return;
    const derived = serviceNameFromUrl(value);
    if (derived) setEditName(derived);
  };

  const handleCustom = () => {
    setSelectedIndex(null);
    setUrlError(null);
    // Carry the search text over: someone who typed a URL into the filter and
    // found nothing was already halfway here.
    if (search.trim()) handleCustomUrlChange(search.trim());
    setCustomMode(true);
  };

  const handleConfirm = () => {
    const result = resolveDraft(
      { mode, editingService, name: editName, url: editUrl, icon: iconState.icon, preset },
      uuidv4,
    );
    if (!result.ok) {
      if (result.error) setUrlError(result.error);
      return;
    }
    iconState.markSubmitted();
    setUrlError(null);
    onSubmit(result.service);
  };

  // The name/URL/icon form backs both editing and adding a custom service.
  const showForm = mode !== "preset";
  const canConfirm = canConfirmDraft({ mode, name: editName, url: editUrl, preset });

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
        closeOnEscape={iconState.cropSource === null}
        trapFocus={iconState.cropSource === null}
      >
        {(close) => (
          <>
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
              <ServiceForm
                iconState={iconState}
                color={editingService?.color}
                name={editName}
                onNameChange={(name) => {
                  nameTouched.current = true;
                  setEditName(name);
                }}
                url={editUrl}
                onUrlChange={handleCustomUrlChange}
                urlError={urlError}
              />
            ) : (
              <PresetGrid
                search={search}
                onSearchChange={(value) => {
                  setSearch(value);
                  setSelectedIndex(null);
                }}
                presets={filtered}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                onCustom={handleCustom}
              />
            )}

            {/* Footer buttons */}
            <div className="flex justify-end" style={{ gap: 12 }}>
              <button
                onClick={() => {
                  // From the custom form, Cancel steps back to the preset grid
                  // rather than throwing away the whole modal.
                  if (mode === "custom") {
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
                {mode === "custom" ? "Back" : "Cancel"}
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
      {iconState.cropSource && (
        <IconCropper
          source={iconState.cropSource}
          onCancel={iconState.cancelCrop}
          onApply={iconState.applyCrop}
        />
      )}
    </>
  );
}
