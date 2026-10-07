// Ctrl+number targets, shared by main (keys pressed inside a service view)
// and the renderer (keys pressed in the interface, the sidebar's hint
// numbers). Ctrl+1 is Home; Ctrl+2-9 are the first eight services in
// sidebar order, disabled ones included. Pure — compiled into both bundles.

export type SwitchTarget = { kind: "home" } | { kind: "service"; index: number };

// What Ctrl+<key> switches to, or null when the key isn't 1-9
export function switchTargetFor(key: string): SwitchTarget | null {
  if (!/^[1-9]$/.test(key)) return null;
  const num = Number(key);
  return num === 1 ? { kind: "home" } : { kind: "service", index: num - 2 };
}

// What Ctrl+<key> inside a service view does, given the sidebar's service ids:
// go Home, open a service, or nothing (not 1-9, or no service at that number).
// An explicit result, because `null` meaning Home once made every other Ctrl
// key — Ctrl on its own included — go Home too.
export function resolveSwitch(
  key: string,
  serviceIds: readonly string[],
): { kind: "home" } | { kind: "service"; id: string } | null {
  const target = switchTargetFor(key);
  if (!target) return null;
  if (target.kind === "home") return target;
  const id = serviceIds[target.index];
  return id === undefined ? null : { kind: "service", id };
}

// The number that opens the service at a zero-based sidebar position, or null
// past the last one a single digit can reach
export function shortcutNumberFor(index: number): number | null {
  const num = index + 2;
  return num <= 9 ? num : null;
}
