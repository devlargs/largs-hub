import { useEffect, useRef } from "react";
import { isInternalService, Service } from "../types";
import { ConfirmPrompt, confirmPromptFor } from "../lib/appActions";

interface ServiceEventHandlers {
  setServices: (services: Service[]) => void;
  // Look up a service in the current list; nothing happens if it's gone
  withService: (serviceId: string, fn: (service: Service) => void) => void;
  // The service that was on screen last time, reopened at launch
  onRestored: (serviceId: string) => void;
  // A service became active from main's side (Ctrl+1-9 in a view, a menu)
  onActivated: (serviceId: string) => void;
  onEdit: (service: Service) => void;
  onConfirm: (prompt: ConfirmPrompt, onConfirm: () => void) => void;
  onRemove: (serviceId: string) => void;
  onShowUpdatePage: () => void;
}

// The service list and the requests main sends about services: the initial
// load, updates from native menus, Ctrl+1-9 switches, and context-menu actions
// that need the renderer.
export function useServiceEvents(handlers: ServiceEventHandlers): void {
  // Registered once; read the latest handlers when an event arrives.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!window.electronAPI) return;
    const api = window.electronAPI;

    // Reopen whatever was on screen last time. Main resolves the id, so a
    // service removed or disabled since launch falls back to Welcome (#89).
    api.getServices().then(async (loaded) => {
      latest.current.setServices(loaded);
      const lastActive = await api.getLastActiveService();
      if (lastActive) {
        latest.current.onRestored(lastActive);
        const service = loaded.find((s) => s.id === lastActive);
        if (!isInternalService(service)) api.showService(lastActive);
      }
    });

    // Services updated from native context menu actions
    const unsubServices = api.onServicesUpdated((updated) => latest.current.setServices(updated));

    // Ctrl+Number service switches from the main process (fired when a
    // service WebContentsView has focus)
    const unsubSwitched = api.onServiceSwitched((serviceId) =>
      latest.current.onActivated(serviceId),
    );

    const unsubActions = api.onContextMenuAction(({ action, serviceId }) => {
      const h = latest.current;
      if (action === "edit-service") {
        h.withService(serviceId, h.onEdit);
      } else if (action === "show-service") {
        h.onActivated(serviceId);
        api.showService(serviceId);
      } else if (action === "show-update-page") {
        h.onShowUpdatePage();
      } else {
        h.withService(serviceId, (svc) => {
          const prompt = confirmPromptFor(action, svc.name);
          if (!prompt) return;
          h.onConfirm(prompt, () => {
            if (action === "confirm-remove-service") {
              h.onRemove(serviceId);
            } else if (action === "confirm-disable-service") {
              void api.toggleServiceEnabled(serviceId).then(latest.current.setServices);
            } else {
              void api.clearServiceData(serviceId);
            }
          });
        });
      }
    });

    return () => {
      unsubServices();
      unsubSwitched();
      unsubActions();
    };
  }, []);
}
