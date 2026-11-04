import { usePhoneStatusStore } from "../../store/phoneStatus";
import { phoneStatusLabel } from "../../lib/phoneStatusLabel";
import PhoneStatusIcon, { TONE_COLOR } from "./PhoneStatusIcon";

// Titlebar chip for the open Google Messages service: what its banners say
// about the paired phone. Coarse by nature; the page has no battery % or
// signal strength to give.
export default function PhoneStatusChip({ serviceId }: { serviceId: string }) {
  const status = usePhoneStatusStore((s) => s.statuses[serviceId]);
  if (!status) return null;
  const label = phoneStatusLabel(status);
  return (
    <span
      className="text-2xs ml-2 px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap"
      style={{ color: TONE_COLOR[label.tone], border: "1px solid var(--border)" }}
      role="status"
      title={`${label.text} (as Google Messages reports it)`}
    >
      <PhoneStatusIcon label={label} size={12} />
      {label.text}
    </span>
  );
}
