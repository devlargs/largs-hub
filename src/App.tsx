import { useEffect, useState, useCallback } from "react";
import { Service } from "./types";
import Sidebar from "./components/Sidebar";
import Titlebar from "./components/Titlebar";
import AddServiceModal from "./components/AddServiceModal";
import WelcomeScreen from "./components/WelcomeScreen";
import UpdatePage from "./components/UpdatePage";
import DisabledServiceScreen from "./components/DisabledServiceScreen";
import { useNotificationStore } from "./store/notifications";

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showUpdatePage, setShowUpdatePage] = useState(false);
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
      setShowUpdatePage(false);
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
        setShowUpdatePage(false);
        window.electronAPI.showService(serviceId);
      } else if (action === "show-update-page") {
        setShowUpdatePage(true);
        setActiveServiceId(null);
        window.electronAPI.hideService();
      }
    });

    return () => {
      unsub();
      unsubServices();
      unsubSwitched();
      unsubActions();
    };
  }, [updateNotificationCount, removeNotificationService]);

  const handleSelectService = useCallback((serviceId: string) => {
    setActiveServiceId(serviceId);
    setShowUpdatePage(false);
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

  return (
    <div className="flex flex-col h-screen w-screen">
      <Titlebar
        activeService={services.find((s) => s.id === activeServiceId) ?? null}
        onReload={handleReloadService}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          services={services}
          activeServiceId={activeServiceId}
          onSelectService={handleSelectService}
          onAddService={async () => {
            setEditingService(null);
            setActiveServiceId(null);
            await window.electronAPI?.hideService();
          }}
          onReorderServices={handleReorderServices}
        />
        {/* BrowserView renders natively on top of this area */}
        <div className="flex-1 relative">
          {!activeServiceId && !showUpdatePage && (
            <WelcomeScreen onAddService={() => setShowAddModal(true)} hasServices={services.length > 0} />
          )}
          {showUpdatePage && !activeServiceId && <UpdatePage />}
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
    </div>
  );
}

export default App;
