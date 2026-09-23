import { useRef } from "react";
import { IoCloudUploadOutline, IoTrashOutline } from "react-icons/io5";
import type { ServiceIconState } from "./useServiceIcon";

interface ServiceFormProps {
  iconState: ServiceIconState;
  // The colour behind the initial when there is no icon
  color: string | undefined;
  name: string;
  onNameChange: (name: string) => void;
  url: string;
  onUrlChange: (url: string) => void;
  urlError: string | null;
}

const fieldStyle = {
  padding: "10px 16px",
  backgroundColor: "var(--panel)",
  color: "var(--text-primary)",
} as const;

const labelStyle = { color: "var(--text-muted)" } as const;

// Name / URL / icon form — editing, or adding a custom service.
export default function ServiceForm({
  iconState,
  color,
  name,
  onNameChange,
  url,
  onUrlChange,
  urlError,
}: ServiceFormProps) {
  return (
    <div className="flex flex-col" style={{ gap: 16, marginBottom: 28 }}>
      <IconPicker iconState={iconState} color={color} name={name} />

      <div className="flex flex-col" style={{ gap: 6 }}>
        <label className="text-xs font-medium" style={labelStyle}>
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-sm outline-none rounded-xl"
          style={{ ...fieldStyle, border: "1px solid var(--border)" }}
        />
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        <label className="text-xs font-medium" style={labelStyle}>
          URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
          aria-invalid={urlError !== null}
          className="text-sm outline-none rounded-xl"
          style={{
            ...fieldStyle,
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
  );
}

function IconPicker({
  iconState,
  color,
  name,
}: {
  iconState: ServiceIconState;
  color: string | undefined;
  name: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { icon, preview } = iconState;
  const iconButtonClass =
    "flex items-center text-xs font-medium cursor-pointer rounded-lg transition-colors hover:opacity-80";

  return (
    <div className="flex flex-col items-center" style={{ gap: 8 }}>
      <label className="text-xs font-medium self-start" style={labelStyle}>
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
          {preview ? (
            <img src={preview} alt="Icon" style={{ width: 40, height: 40, objectFit: "contain" }} />
          ) : (
            <span
              className="flex items-center justify-center text-white font-bold text-lg"
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: color || "#6c7086",
              }}
            >
              {name.charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={iconButtonClass}
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
          {preview && icon.startsWith("custom:") && (
            <button
              onClick={() => iconState.remove(name)}
              className={iconButtonClass}
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
          onChange={iconState.pickFile}
          className="hidden"
        />
      </div>
    </div>
  );
}
