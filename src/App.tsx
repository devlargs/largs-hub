import { useEffect, useState, useCallback, useRef } from "react";
import { AutomationTask, isInternalService, Service } from "./types";
import Sidebar from "./components/Sidebar";
import Titlebar from "./components/Titlebar";
import AddServiceModal from "./components/AddServiceModal";
import LinkPreviewModal from "./components/LinkPreviewModal";
import FindBar from "./components/FindBar";
import MessengerAutomationPanel from "./components/MessengerAutomationPanel";
import WelcomeScreen from "./components/WelcomeScreen";
import SettingsPage from "./components/SettingsPage";
import DisabledServiceScreen from "./components/DisabledServiceScreen";
import TodoPage from "./components/todo/TodoPage";
import RetiredNoteTakerScreen from "./components/RetiredNoteTakerScreen";
import LockScreen from "./components/LockScreen";
import ConfirmDialog, { ConfirmTone } from "./components/ui/ConfirmDialog";
import { useNotificationStore } from "./store/notifications";

// Mirrors the main process's hostname-based Messenger detection (main.ts)
function isMessengerService(service: Service | null | undefined): boolean {
  if (!service) return false;
  try {
    return new URL(service.url).hostname.includes("messenger");
  } catch {
    return false;
  }
}

// Ctrl+<key> zoom shortcuts, mirroring ZOOM_KEYS in electron/serviceViews.ts so
// the shortcut behaves the same whether the interface or a service has focus.
const ZOOM_KEYS: Record<string, "in" | "out" | "reset"> = {
  "=": "in",
  "+": "in",
  "-": "out",
  _: "out",
  "0": "reset",
};

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState<string | null>(null);
  const [showAutomationPanel, setShowAutomationPanel] = useState(false);
  // Find bar: the service it is searching, or null when closed.
  const [findServiceId, setFindServiceId] = useState<string | null>(null);
  // Per-service zoom factors, mirrored from the main process for the titlebar.
  const [zoomFactors, setZoomFactors] = useState<Record<string, number>>({});
  const [automationTasks, setAutomationTasks] = useState<AutomationTask[]>([]);
  // The workspace lock (issue #102). Main owns the state — a fresh launch, the
  // auto-lock countdown and every unlock are decided there — so the renderer
  // only mirrors it.
  // The destructive prompts the service context menu asks for (issue #104).
  // Main no longer opens a native message box; it sends the request here.
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    tone: ConfirmTone;
    onConfirm: () => void;
  } | null>(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  lockedRef.current = locked;
  // Read inside window-level key handlers, which are registered once and must
  // not re-bind on every service switch.
  const activeServiceIdRef = useRef<string | null>(null);
  activeServiceIdRef.current = activeServiceId;
  const updateNotificationCount = useNotificationStore((s) => s.updateCount);
  const setNotificationCounts = useNotificationStore((s) => s.setCounts);
  const removeNotificationService = useNotificationStore((s) => s.removeService);

  const handleRemoveService = useCallback(
    async (serviceId: string) => {
      const updated = await window.electronAPI.removeService(serviceId);
      setServices(updated);
      removeNotificationService(serviceId);
      setActiveServiceId((prev) => {
        if (prev === serviceId) {
          window.electronAPI.hideService();
          return null;
        }
        return prev;
      });
    },
    [removeNotificationService],
  );

  useEffect(() => {
    if (!window.electronAPI) return;

    // Reopen whatever was on screen last time. Main resolves the id, so a
    // service removed or disabled since launch falls back to Welcome (#89).
    window.electronAPI.getServices().then(async (loaded) => {
      setServices(loaded);
      const lastActive = await window.electronAPI.getLastActiveService();
      if (lastActive) {
        setActiveServiceId(lastActive);
        const service = loaded.find((s) => s.id === lastActive);
        if (!isInternalService(service)) window.electronAPI.showService(lastActive);
      }
    });

    window.electronAPI.security.getState().then((state) => setLocked(state.locked));
    const unsubSecurity = window.electronAPI.security.onStateChanged((state) =>
      setLocked(state.locked),
    );

    // Seed from main before subscribing: counts already held there are only
    // pushed when they change, so a UI reload would otherwise show no badges.
    window.electronAPI.getNotificationCounts().then(setNotificationCounts);

    const unsub = window.electronAPI.onNotificationUpdate(({ serviceId, count }) => {
      updateNotificationCount(serviceId, count);
    });

    // Listen for services updated from native context menu actions
    const unsubServices = window.electronAPI.onServicesUpdated((updated) => {
      setServices(updated);
    });

    // Listen for Ctrl+Number service switches from the main process
    // (fired when a service WebContentsView has focus)
    const unsubSwitched = window.electronAPI.onServiceSwitched((serviceId) => {
      setActiveServiceId(serviceId);
      setShowSettingsPage(false);
    });

    // Listen for context menu actions that need renderer handling
    const unsubActions = window.electronAPI.onContextMenuAction(({ action, serviceId }) => {
      if (action === "edit-service") {
        setServices((current) => {
          const svc = current.find((s) => s.id === serviceId);
          if (svc) {
            setEditingService(svc);
            setShowAddModal(true);
          }
          return current;
        });
      } else if (action === "confirm-remove-service") {
        setServices((current) => {
          const svc = current.find((s) => s.id === serviceId);
          if (svc) {
            setConfirm({
              title: `Remove ${svc.name}?`,
              body: "This permanently removes the service from Largs Hub, along with its saved sign-in.",
              confirmLabel: "Remove",
              tone: "danger",
              onConfirm: () => void handleRemoveService(serviceId),
            });
          }
          return current;
        });
      } else if (action === "confirm-clear-data") {
        setServices((current) => {
          const svc = current.find((s) => s.id === serviceId);
          if (svc) {
            setConfirm({
              title: `Clear ${svc.name}'s data?`,
              body: "This signs the account out and deletes the service's cookies, site data and cache. The service itself is kept.",
              confirmLabel: "Clear data",
              tone: "danger",
              onConfirm: () => void window.electronAPI.clearServiceData(serviceId),
            });
          }
          return current;
        });
      } else if (action === "show-service") {
        setActiveServiceId(serviceId);
        setShowSettingsPage(false);
        window.electronAPI.showService(serviceId);
      } else if (action === "show-update-page") {
        setShowSettingsPage(true);
        setActiveServiceId(null);
        window.electronAPI.hideService();
      }
    });

    // Ctrl+F (or the context menu) inside a service view — main has already
    // handed keyboard focus to this view, so the input can take it.
    const unsubFindOpen = window.electronAPI.onOpenFindBar((serviceId) => {
      setFindServiceId(serviceId);
    });
    const unsubFindClose = window.electronAPI.onCloseFindBar(() => {
      setFindServiceId(null);
    });

    const unsubZoom = window.electronAPI.onServiceZoomChanged(({ serviceId, factor }) => {
      setZoomFactors((current) => ({ ...current, [serviceId]: factor }));
    });

    // Link preview modal opened from a service view's context menu
    const unsubLinkOpen = window.electronAPI.onLinkPreviewOpen((url) => {
      setLinkPreviewUrl(url);
    });
    const unsubLinkClosed = window.electronAPI.onLinkPreviewClosed(() => {
      setLinkPreviewUrl(null);
    });

    // Messenger automation task state pushed from the main process
    window.electronAPI.messengerAutomation.list().then(setAutomationTasks);
    const unsubAutomation = window.electronAPI.messengerAutomation.onUpdated(setAutomationTasks);

    return () => {
      unsub();
      unsubServices();
      unsubSwitched();
      unsubActions();
      unsubLinkOpen();
      unsubLinkClosed();
      unsubAutomation();
      unsubFindOpen();
      unsubFindClose();
      unsubZoom();
      unsubSecurity();
    };
  }, [
    updateNotificationCount,
    setNotificationCounts,
    removeNotificationService,
    handleRemoveService,
  ]);

  const handleSelectService = useCallback((serviceId: string) => {
    setActiveServiceId(serviceId);
    setShowSettingsPage(false);
    setServices((current) => {
      const svc = current.find((s) => s.id === serviceId);
      if (isInternalService(svc) || svc?.enabled === false) {
        // Internal services render as React pages — no web view to show
        window.electronAPI?.hideService();
      } else {
        window.electronAPI?.showService(serviceId);
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Nothing behind the lock screen is reachable, shortcuts included.
      if (lockedRef.current) return;
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      // Zoom tolerates shift ("+" is shift+"=" on most layouts).
      const zoomDirection = ZOOM_KEYS[e.key];
      if (zoomDirection && activeServiceIdRef.current) {
        e.preventDefault();
        window.electronAPI?.stepServiceZoom(activeServiceIdRef.current, zoomDirection);
        return;
      }
      if (e.shiftKey) return;
      if (e.key.toLowerCase() === "f") {
        if (!activeServiceIdRef.current) return;
        e.preventDefault();
        setFindServiceId(activeServiceIdRef.current);
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        setServices((current) => {
          const service = current[num - 1];
          if (service) {
            handleSelectService(service.id);
          }
          return current;
        });
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleSelectService]);

  const handleAddService = useCallback(async (service: Service) => {
    const updated = await window.electronAPI.addService(service);
    setServices(updated);
    setShowAddModal(false);
    setActiveServiceId(null);
    await window.electronAPI?.hideService();
  }, []);

  const handleUpdateService = useCallback(async (service: Service) => {
    const updated = await window.electronAPI.updateService(service);
    setServices(updated);
    setShowAddModal(false);
    setEditingService(null);
  }, []);

  const handleReorderServices = useCallback(async (serviceIds: string[]) => {
    const updated = await window.electronAPI.reorderServices(serviceIds);
    setServices(updated);
  }, []);

  const handleReloadService = useCallback(() => {
    if (activeServiceId) {
      window.electronAPI?.reloadService(activeServiceId);
    }
  }, [activeServiceId]);

  const handleGoBack = useCallback(() => {
    if (activeServiceId) {
      window.electronAPI?.goBack(activeServiceId);
    }
  }, [activeServiceId]);

  const handleGoForward = useCallback(() => {
    if (activeServiceId) {
      window.electronAPI?.goForward(activeServiceId);
    }
  }, [activeServiceId]);

  // Bring UI to front when modal is open so it renders above service views
  useEffect(() => {
    if (!showAddModal) return;
    window.electronAPI?.bringUiToFront();
    return () => {
      window.electronAPI?.sendUiToBack();
    };
  }, [showAddModal]);

  const linkPreviewOpen = linkPreviewUrl !== null;
  useEffect(() => {
    if (!linkPreviewOpen) return;
    window.electronAPI?.bringUiToFront();
    return () => {
      window.electronAPI?.sendUiToBack();
    };
  }, [linkPreviewOpen]);

  // Reserve the find bar's strip in the service view's bounds while it is open,
  // and drop the page's match highlighting when it closes.
  const findOpen = findServiceId !== null;
  useEffect(() => {
    window.electronAPI?.setFindBarOpen(findOpen);
    return () => {
      window.electronAPI?.setFindBarOpen(false);
    };
  }, [findOpen]);

  // The bar searches one service; switching away (or hiding the view) closes it.
  useEffect(() => {
    if (findServiceId && findServiceId !== activeServiceId) {
      window.electronAPI?.stopFindInPage(findServiceId);
      setFindServiceId(null);
    }
  }, [findServiceId, activeServiceId]);

  // Seed the titlebar's zoom indicator when a service is opened; later changes
  // arrive on the service-zoom-changed event.
  useEffect(() => {
    if (!activeServiceId) return;
    window.electronAPI?.getServiceZoom(activeServiceId).then((factor) => {
      setZoomFactors((current) => ({ ...current, [activeServiceId]: factor }));
    });
  }, [activeServiceId]);

  const activeService = services.find((s) => s.id === activeServiceId) ?? null;

  // Split the layout into a service pane (left) and the automation panel
  // (right) by resizing the Messenger view instead of hiding it, so the
  // conversation stays visible beside the panel.
  useEffect(() => {
    if (!showAutomationPanel) return;
    window.electronAPI?.messengerAutomation.setSplitOpen(true);
    return () => {
      window.electronAPI?.messengerAutomation.setSplitOpen(false);
    };
  }, [showAutomationPanel]);

  // Close the panel when navigating away from a Messenger service
  const automationAvailable = isMessengerService(activeService);
  useEffect(() => {
    if (showAutomationPanel && !automationAvailable) {
      setShowAutomationPanel(false);
    }
  }, [showAutomationPanel, automationAvailable]);

  return (
    <div className="flex flex-col h-screen w-screen">
      <Titlebar
        activeService={activeService}
        onReload={handleReloadService}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onOpenSettings={async () => {
          setActiveServiceId(null);
          setShowSettingsPage(true);
          await window.electronAPI?.hideService();
        }}
        zoomFactor={activeServiceId ? (zoomFactors[activeServiceId] ?? 1) : 1}
        onResetZoom={() => {
          if (activeServiceId) window.electronAPI?.stepServiceZoom(activeServiceId, "reset");
        }}
        showAutomation={automationAvailable}
        automationActive={automationTasks.some((t) => t.serviceId === activeServiceId)}
        onOpenAutomation={() => setShowAutomationPanel((open) => !open)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          services={services}
          activeServiceId={activeServiceId}
          onSelectService={handleSelectService}
          onAddService={async () => {
            setEditingService(null);
            setActiveServiceId(null);
            setShowSettingsPage(false);
            await window.electronAPI?.hideService();
          }}
          onReorderServices={handleReorderServices}
        />
        {/* BrowserView renders natively on top of this area */}
        <div className="flex-1 relative">
          {!activeServiceId && !showSettingsPage && (
            <WelcomeScreen
              onAddService={() => setShowAddModal(true)}
              hasServices={services.length > 0}
            />
          )}
          {showSettingsPage && !activeServiceId && <SettingsPage />}
          {activeService?.type === "todo" && activeService.enabled !== false && (
            <TodoPage key={activeService.id} service={activeService} />
          )}
          {activeService?.type === "notion-notes" && activeService.enabled !== false && (
            <RetiredNoteTakerScreen
              service={activeService}
              onRemove={() => handleRemoveService(activeService.id)}
            />
          )}
          {activeServiceId &&
            (() => {
              const svc = services.find((s) => s.id === activeServiceId);
              return svc?.enabled === false ? (
                <DisabledServiceScreen
                  serviceName={svc.name}
                  onEnable={async () => {
                    const updated = await window.electronAPI.toggleServiceEnabled(svc.id);
                    setServices(updated);
                    window.electronAPI?.showService(svc.id);
                  }}
                />
              ) : null;
            })()}
        </div>
      </div>
      {findServiceId && (
        <FindBar
          serviceId={findServiceId}
          onClose={() => {
            window.electronAPI?.stopFindInPage(findServiceId);
            setFindServiceId(null);
          }}
        />
      )}
      {linkPreviewUrl && (
        <LinkPreviewModal
          url={linkPreviewUrl}
          onClose={() => window.electronAPI.closeLinkPreview()}
        />
      )}
      {showAddModal && (
        <AddServiceModal
          editingService={editingService}
          onSubmit={editingService ? handleUpdateService : handleAddService}
          onClose={() => {
            setShowAddModal(false);
            setEditingService(null);
          }}
        />
      )}
      {showAutomationPanel && activeServiceId && (
        <MessengerAutomationPanel
          serviceId={activeServiceId}
          tasks={automationTasks}
          onClose={() => setShowAutomationPanel(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
      {/* Last, and fixed inset-0, so it covers the titlebar and sidebar too. */}
      {locked && <LockScreen />}
    </div>
  );
}

export default App;
