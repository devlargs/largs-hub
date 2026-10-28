import type { Service } from "../../types";
import { serviceHost } from "../../lib/serviceUrl";
import InfoPopover from "./InfoPopover";
import ServiceIcon from "../ui/ServiceIcon";
import { SecondaryButton } from "./controls";

const INFO =
  "Services you hid from the sidebar with right-click → Hide service. They keep running in the background, but their unread counts don't show and the number shortcuts skip them. Unhide puts one back in the sidebar where it was.";

// Settings → Privacy: the services hidden from the sidebar, each with Unhide.
// This is the only place they're listed, so hiding stays out of sight.
export default function HiddenServicesTable({
  services,
  onUnhide,
}: {
  // Only the hidden ones (hiddenServices), in sidebar order
  services: Service[];
  onUnhide: (serviceId: string) => void;
}) {
  return (
    <div className="py-2 @lg:px-3.5 @lg:py-3">
      <div className="flex items-center gap-1.5" style={{ marginBottom: 10 }}>
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Hidden services
        </span>
        <InfoPopover label="Hidden services" text={INFO} />
      </div>

      {services.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No hidden services. Right-click a service in the sidebar and choose Hide service.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr
                className="text-left text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)", backgroundColor: "var(--sidebar-hover)" }}
              >
                <th className="px-3 py-2 font-semibold">Service</th>
                <th className="hidden px-3 py-2 font-semibold @lg:table-cell">Address</th>
                <th className="w-[104px] px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <ServiceIcon service={service} small />
                      </span>
                      <span className="truncate" style={{ color: "var(--text-primary)" }}>
                        {service.name}
                      </span>
                      {service.enabled === false && (
                        <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                          Disabled
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className="hidden truncate px-3 py-2 @lg:table-cell"
                    style={{ color: "var(--text-muted)" }}
                    title={service.url}
                  >
                    {serviceHost(service.url)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <SecondaryButton onClick={() => onUnhide(service.id)}>Unhide</SecondaryButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
