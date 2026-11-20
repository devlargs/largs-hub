// Ctrl+number targets (Cmd+number works too on macOS), shared by main (keys pressed
// inside a service view) and the renderer (keys pressed in the interface, the
// sidebar's hint numbers). 1 is Home; 2-9 are the first eight services in
// sidebar order, disabled ones included and hidden ones not. Pure — compiled
// into both bundles.

// A modifier held for the number shortcuts and their sidebar hints
export type SwitchModifier = "control" | "meta";

// Every modifier that switches: Ctrl everywhere, and on macOS Cmd as well,
// like its other apps' tab switching. Ctrl stays on macOS so the Ctrl+number
// habit from Windows keeps working there.
export function switchModifiersFor(platform: string): readonly SwitchModifier[] {
  return platform === "darwin" ? ["meta", "control"] : ["control"];
}

// aria-keyshortcuts for <modifier>+<key>: alternatives are space-separated
export function switchKeyShortcuts(modifiers: readonly SwitchModifier[], key: number): string {
  return modifiers.map((m) => `${SWITCH_MODIFIER_KEY[m]}+${key}`).join(" ");
}

// The key name Electron's Input and a DOM KeyboardEvent give the modifier itself
export const SWITCH_MODIFIER_KEY: Record<SwitchModifier, string> = {
  control: "Control",
  meta: "Meta",
};

export interface ModifierState {
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

// A switch modifier on its own: not with shift, alt or the other one of
// Ctrl/Cmd, so Ctrl+Cmd+1 or Cmd+Shift+1 stay with the page.
export function isSwitchChord(
  mods: ModifierState,
  modifiers: SwitchModifier | readonly SwitchModifier[],
): boolean {
  const accepted: readonly SwitchModifier[] =
    typeof modifiers === "string" ? [modifiers] : modifiers;
  return accepted.some((modifier) => {
    const other = modifier === "control" ? mods.meta : mods.control;
    return mods[modifier] && !other && !mods.alt && !mods.shift;
  });
}

export type SwitchTarget = { kind: "home" } | { kind: "service"; index: number };

// What <modifier>+<key> switches to, or null when the key isn't 1-9
export function switchTargetFor(key: string): SwitchTarget | null {
  if (!/^[1-9]$/.test(key)) return null;
  const num = Number(key);
  return num === 1 ? { kind: "home" } : { kind: "service", index: num - 2 };
}

// What <modifier>+<key> inside a service view does, given the sidebar's service
// ids: go Home, open a service, or nothing (not 1-9, or no service at that
// number). An explicit result, because `null` meaning Home once made every
// other Ctrl key — Ctrl on its own included — go Home too.
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
