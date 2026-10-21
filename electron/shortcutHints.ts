// Ctrl+1-9 (Cmd+1-9 on macOS) switches services, but nothing on screen said
// which number was which. Holding that modifier on its own for a moment puts
// the numbers on the sidebar.
//
// Pure and Electron-free (see test/shortcutHints.test.ts). window/state.ts feeds it
// every `before-input-event` from the UI view, the service views and the link
// preview — whichever one has keyboard focus is the only one that hears the
// key — and forwards visibility changes to the renderer.

import { SWITCH_MODIFIER_KEY, type SwitchModifier } from "./shared/shortcuts";

export const SHORTCUT_HINT_HOLD_MS = 2000;

// The fields of Electron's Input this needs
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
}

export interface ShortcutHintTracker {
  handleInput(input: KeyInput): void;
  // Window blur: a modifier released in another app never reaches us
  reset(): void;
}

export function createShortcutHintTracker(options: {
  onChange: (visible: boolean) => void;
  // Ctrl by default; main passes Cmd on macOS (switchModifierFor)
  modifier?: SwitchModifier;
  holdMs?: number;
}): ShortcutHintTracker {
  const holdMs = options.holdMs ?? SHORTCUT_HINT_HOLD_MS;
  const modifier = options.modifier ?? "control";
  const modifierKey = SWITCH_MODIFIER_KEY[modifier];
  let held = false;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const setVisible = (next: boolean) => {
    if (visible === next) return;
    visible = next;
    options.onChange(next);
  };

  const release = () => {
    held = false;
    clearTimer();
    setVisible(false);
  };

  return {
    handleInput(input) {
      if (input.key === modifierKey) {
        if (input.type === "keyUp") release();
        // Held keys auto-repeat keyDown; only the first one starts the clock
        else if (input.type === "keyDown" && !held) {
          held = true;
          timer = setTimeout(() => {
            timer = null;
            setVisible(true);
          }, holdMs);
        }
        return;
      }
      if (!held) return;
      // The modifier's keyUp can land in a view nobody is listening to; any
      // input without the modifier means it is no longer down.
      if (!input[modifier]) {
        release();
        return;
      }
      // Ctrl+C, Ctrl+F… before the hints appeared: a shortcut, not a look at
      // the numbers. Once they're up they stay while Ctrl is held, so Ctrl+2
      // then Ctrl+3 can hop along the list.
      if (input.type === "keyDown" && !visible) clearTimer();
    },
    reset: release,
  };
}
