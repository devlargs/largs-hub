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

// The number that opens the service at a zero-based sidebar position, or null
// past the last one a single digit can reach
export function shortcutNumberFor(index: number): number | null {
  const num = index + 2;
  return num <= 9 ? num : null;
}
