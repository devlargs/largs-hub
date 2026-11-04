import type { PhoneStatusLabel } from "../../lib/phoneStatusLabel";
import PhoneStatusIcon, { TONE_COLOR } from "./PhoneStatusIcon";

// Bottom-right mark on a sidebar icon when the paired phone needs attention.
export default function PhoneStatusMark({ label }: { label: PhoneStatusLabel }) {
  return (
    <span
      className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
      style={{
        width: 18,
        height: 18,
        background: "var(--sidebar)",
        color: TONE_COLOR[label.tone],
        border: "1px solid var(--border)",
      }}
      aria-hidden="true"
    >
      <PhoneStatusIcon label={label} size={11} />
    </span>
  );
}
