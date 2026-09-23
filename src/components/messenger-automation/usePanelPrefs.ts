import { useEffect, useRef } from "react";
import type { AutomationPrefs } from "../../types";
import { AutomationForm, formFromPrefs, prefsFromForm } from "../../lib/automationForm";

// How long the form must sit unchanged before its settings are saved. Typing
// in a number field shouldn't write the store on every keystroke.
const SAVE_DELAY_MS = 400;

/**
 * Remembers the panel's settings for a service: on open, restores what was
 * last left there (through `restore`), and from then on saves each change a
 * moment after it's made. A change still waiting is saved when the panel
 * closes or moves to another service. The message text is never kept.
 *
 * `restore` is skipped if the form was already edited before the saved
 * settings arrived, so a fast first keystroke isn't overwritten.
 */
export function usePanelPrefs(
  serviceId: string,
  form: AutomationForm,
  autoStopMinutes: string,
  restore: (form: AutomationForm, autoStopMinutes: string | undefined) => void,
): void {
  // Compared as JSON so a re-render with the same values doesn't save again
  const key = JSON.stringify(prefsFromForm(form, autoStopMinutes));

  // Saving starts only once the saved settings have been read, so the
  // defaults the panel opens with never overwrite them.
  const loaded = useRef(false);
  const edited = useRef(false);
  const keyWhenOpened = useRef(key);
  const pending = useRef<{ serviceId: string; prefs: AutomationPrefs } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreRef = useRef(restore);
  const keyRef = useRef(key);
  useEffect(() => {
    restoreRef.current = restore;
    keyRef.current = key;
  });

  const flush = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) void window.electronAPI?.messengerAutomation.savePrefs(next.serviceId, next.prefs);
  }).current;

  useEffect(() => {
    flush(); // the previous service's last change, if the panel moved on
    let cancelled = false;
    loaded.current = false;
    edited.current = false;
    keyWhenOpened.current = keyRef.current;
    const api = window.electronAPI?.messengerAutomation;
    if (!api) return;
    Promise.all([api.getPrefs(serviceId), window.electronAPI.listGroups.list()])
      .then(([prefs, groups]) => {
        if (cancelled) return;
        loaded.current = true;
        if (!edited.current) {
          restoreRef.current(formFromPrefs(prefs, groups), prefs.autoStopMinutes);
        } else {
          // Edited while loading: those edits are what to keep
          pending.current = { serviceId, prefs: JSON.parse(keyRef.current) };
          flush();
        }
      })
      .catch(() => {
        if (!cancelled) loaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, flush]);

  useEffect(() => {
    if (!loaded.current) {
      if (key !== keyWhenOpened.current) edited.current = true;
      return;
    }
    pending.current = { serviceId, prefs: JSON.parse(key) };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [serviceId, key, flush]);

  // Closing the panel mid-delay still saves the last change.
  useEffect(() => flush, [flush]);
}
