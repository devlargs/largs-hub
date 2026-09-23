import type { Service } from "./shared/types";

// Changes to the stored service list, pure so they can be unit-tested
// (test/serviceList.test.ts). The IPC handlers in ipc/services.ts validate the
// payload and store the result.

// The list with `service` appended, or null when its id is already taken.
export function withAddedService(services: Service[], service: Service): Service[] | null {
  if (services.some((s) => s.id === service.id)) return null;
  return [...services, service];
}

// The services in the order of `serviceIds`. Ids that don't match a service
// are skipped, and so are services whose id isn't listed.
export function reorderServices(services: Service[], serviceIds: string[]): Service[] {
  return serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => s !== undefined);
}

// The service to reopen on launch: the stored id, if that service still
// exists and is enabled. A stale id never reaches the UI.
export function lastActiveServiceId(stored: unknown, services: Service[]): string | null {
  if (typeof stored !== "string") return null;
  const service = services.find((s) => s.id === stored);
  return service && service.enabled !== false ? service.id : null;
}
