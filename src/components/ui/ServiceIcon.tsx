import type { Service } from "../../types";
import { resolveIcon } from "../../assets/serviceIcons";

// The built-in or uploaded icon, an emoji icon, or the name's initial. `small`
// is the size used in lists (the Hidden services table); the default is the
// sidebar's.
export default function ServiceIcon({ service, small }: { service: Service; small?: boolean }) {
  const resolved = resolveIcon(service.icon, service.name);
  if (resolved) {
    return (
      <img
        src={resolved}
        alt=""
        className={`${small ? "w-5 h-5" : "w-7 h-7"} rounded object-contain`}
      />
    );
  }
  if (service.icon) {
    return <span className={small ? "text-base" : "text-2xl"}>{service.icon}</span>;
  }
  return (
    <span
      className={`${small ? "w-5 h-5 text-[10px]" : "w-9 h-9 text-sm"} rounded-lg flex items-center justify-center text-white font-bold`}
      style={{ backgroundColor: service.color || "#6c7086" }}
    >
      {service.name.charAt(0).toUpperCase()}
    </span>
  );
}
