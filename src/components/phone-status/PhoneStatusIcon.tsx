import { IoBatteryDead, IoCellular, IoPhonePortraitOutline, IoWarning } from "react-icons/io5";
import type { PhoneStatusLabel, PhoneStatusTone } from "../../lib/phoneStatusLabel";

export const TONE_COLOR: Record<PhoneStatusTone, string> = {
  ok: "var(--text-muted)",
  warn: "var(--warning)",
  error: "var(--danger)",
};

export default function PhoneStatusIcon({
  label,
  size,
}: {
  label: PhoneStatusLabel;
  size: number;
}) {
  switch (label.icon) {
    case "unreachable":
      return <IoWarning size={size} />;
    case "battery-low":
      return <IoBatteryDead size={size} />;
    case "mobile-data":
      return <IoCellular size={size} />;
    default:
      return <IoPhonePortraitOutline size={size} />;
  }
}
