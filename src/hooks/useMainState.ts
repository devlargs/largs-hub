import { useEffect, useState } from "react";
import type { AutomationTask } from "../types";
import { useNotificationStore } from "../store/notifications";

// State the main process owns and the interface only mirrors: each hook reads
// the current value, then follows main's pushes.

// Hide the active service view while `open`, so the UI layer renders above it
// (the z-order rule in CLAUDE.md). Main ref-counts these, so overlays nest.
export function useUiLayer(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    window.electronAPI?.bringUiToFront();
    return () => {
      window.electronAPI?.sendUiToBack();
    };
  }, [open]);
}

// The workspace lock (issue #102). Main owns the state — a fresh launch, the
// auto-lock countdown and every unlock are decided there.
export function useWorkspaceLock(): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.security.getState().then((state) => setLocked(state.locked));
    return window.electronAPI.security.onStateChanged((state) => setLocked(state.locked));
  }, []);
  return locked;
}

// Ctrl held down: the sidebar numbers its first nine services (main decides
// when, since a focused service view never passes keys to this window).
export function useShortcutHints(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => window.electronAPI?.onShortcutHintsChanged(setVisible), []);
  return visible;
}

// Keeps the notification store in step with main's unread counts.
export function useNotificationSync(): void {
  const updateCount = useNotificationStore((s) => s.updateCount);
  const setCounts = useNotificationStore((s) => s.setCounts);
  useEffect(() => {
    if (!window.electronAPI) return;
    // Seed from main before subscribing: counts already held there are only
    // pushed when they change, so a UI reload would otherwise show no badges.
    window.electronAPI.getNotificationCounts().then(setCounts);
    return window.electronAPI.onNotificationUpdate(({ serviceId, count }) => {
      updateCount(serviceId, count);
    });
  }, [updateCount, setCounts]);
}

// Messenger automation task state pushed from the main process
export function useAutomationTasks(): AutomationTask[] {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.messengerAutomation.list().then(setTasks);
    return window.electronAPI.messengerAutomation.onUpdated(setTasks);
  }, []);
  return tasks;
}

// The link preview modal, opened from a service view's context menu. Main
// opens and closes it; the page itself is a native view main positions.
export function useLinkPreview(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubOpen = window.electronAPI.onLinkPreviewOpen(setUrl);
    const unsubClosed = window.electronAPI.onLinkPreviewClosed(() => setUrl(null));
    return () => {
      unsubOpen();
      unsubClosed();
    };
  }, []);
  useUiLayer(url !== null);
  return url;
}

// The active service's zoom factor, for the titlebar's zoom indicator.
export function useZoomFactor(activeServiceId: string | null): number {
  // Per-service zoom factors, mirrored from the main process
  const [factors, setFactors] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onServiceZoomChanged(({ serviceId, factor }) => {
      setFactors((current) => ({ ...current, [serviceId]: factor }));
    });
  }, []);

  // Seed when a service is opened; later changes arrive on the event above.
  useEffect(() => {
    if (!activeServiceId) return;
    window.electronAPI?.getServiceZoom(activeServiceId).then((factor) => {
      setFactors((current) => ({ ...current, [activeServiceId]: factor }));
    });
  }, [activeServiceId]);

  return activeServiceId ? (factors[activeServiceId] ?? 1) : 1;
}
