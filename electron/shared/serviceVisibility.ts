// Which services the sidebar shows. A hidden service is left out of it (and so
// out of the Ctrl/Cmd+number shortcuts, which follow sidebar order) and listed
// under the Hidden Services button instead. Pure — compiled into both bundles.

export function isHiddenService(service: { hidden?: boolean } | null | undefined): boolean {
  return service?.hidden === true;
}

/** The services the sidebar shows, in order. */
export function sidebarServices<T extends { hidden?: boolean }>(services: readonly T[]): T[] {
  return services.filter((s) => !isHiddenService(s));
}

/** The services listed under Hidden Services, in order. */
export function hiddenServices<T extends { hidden?: boolean }>(services: readonly T[]): T[] {
  return services.filter(isHiddenService);
}
