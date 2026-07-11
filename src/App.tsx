import { useEffect, useState, useCallback } from "react";
import { AutomationTask, Service } from "./types";
import Sidebar from "./components/Sidebar";
import Titlebar from "./components/Titlebar";
import AddServiceModal from "./components/AddServiceModal";
import LinkPreviewModal from "./components/LinkPreviewModal";
import MessengerAutomationPanel from "./components/MessengerAutomationPanel";
import WelcomeScreen from "./components/WelcomeScreen";
import SettingsPage from "./components/SettingsPage";
import DisabledServiceScreen from "./components/DisabledServiceScreen";
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

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState<string | null>(null);
  const [showAutomationPanel, setShowAutomationPanel] = useState(false);
  const [automationTasks, setAutomationTasks] = useState<AutomationTask[]>([]);
  const updateNotificationCount = useNotificationStore((s) => s.updateCount);
  const removeNotificationService = useNotificationStore((s) => s.removeService);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getServices().then((loaded) => {
      setServices(loaded);
    });

    const unsub = window.electronAPI.onNotificationUpdate(
      ({ serviceId, count }) => {
        updateNotificationCount(serviceId, count);
      },
    );

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
      } else if (action === "remove-service") {
        window.electronAPI.removeService(serviceId).then((updated) => {
          setServices(updated);
          removeNotificationService(serviceId);
          setActiveServiceId((prev) => {
            if (prev === serviceId) {
              window.electronAPI.hideService();
              return null;
            }
            return prev;
          });
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

    // Link preview modal opened from a service view's context menu
    const unsubLinkOpen = window.electronAPI.onLinkPreviewOpen((url) => {
      setLinkPreviewUrl(url);
    });
    const unsubLinkClosed = window.electronAPI.onLinkPreviewClosed(() => {
      setLinkPreviewUrl(null);
    });

    // Messenger automation task state pushed from the main process
    window.electronAPI.messengerAutomation.list().then(setAutomationTasks);
    const unsubAutomation =
      window.electronAPI.messengerAutomation.onUpdated(setAutomationTasks);

    return () => {
      unsub();
      unsubServices();
      unsubSwitched();
      unsubActions();
      unsubLinkOpen();
      unsubLinkClosed();
      unsubAutomation();
    };
  }, [updateNotificationCount, removeNotificationService]);

  const handleSelectService = useCallback((serviceId: string) => {
    setActiveServiceId(serviceId);
    setShowSettingsPage(false);
    setServices((current) => {
      const svc = current.find((s) => s.id === serviceId);
      if (svc?.enabled !== false) {
        window.electronAPI?.showService(serviceId);
      } else {
        window.electronAPI?.hideService();
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
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

  const handleAddService = useCallback(
    async (service: Service) => {
      const updated = await window.electronAPI.addService(service);
      setServices(updated);
      setShowAddModal(false);
      setActiveServiceId(null);
      await window.electronAPI?.hideService();
    },
    [],
  );

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
            <WelcomeScreen onAddService={() => setShowAddModal(true)} hasServices={services.length > 0} />
          )}
          {showSettingsPage && !activeServiceId && <SettingsPage />}
          {activeServiceId && (() => {
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
    </div>
  );
}

export default App;
