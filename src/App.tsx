import { useEffect, useState, useCallback } from "react";
import { Service } from "./types";
import Sidebar from "./components/Sidebar";
import Titlebar from "./components/Titlebar";
import AddServiceModal from "./components/AddServiceModal";
import WelcomeScreen from "./components/WelcomeScreen";
import UpdatePage from "./components/UpdatePage";

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showUpdatePage, setShowUpdatePage] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getServices().then((loaded) => {
      setServices(loaded);
    });

    const unsub = window.electronAPI.onNotificationUpdate(
      ({ serviceId, count }) => {
        setServices((prev) =>
          prev.map((s) =>
            s.id === serviceId ? { ...s, notificationCount: count } : s,
          ),
        );
      },
    );

    return unsub;
  }, []);

  const handleSelectService = useCallback((serviceId: string) => {
    setActiveServiceId(serviceId);
    setShowUpdatePage(false);
    window.electronAPI?.showService(serviceId);
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

  const handleRemoveService = useCallback(
    async (serviceId: string) => {
      const updated = await window.electronAPI.removeService(serviceId);
      setServices(updated);
      if (activeServiceId === serviceId) {
        setActiveServiceId(null);
        await window.electronAPI.hideService();
      }
    },
    [activeServiceId],
  );

  const handleEditService = useCallback((service: Service) => {
    setEditingService(service);
    setShowAddModal(true);
  }, []);

  const handleUpdateService = useCallback(async (service: Service) => {
    const updated = await window.electronAPI.updateService(service);
    setServices(updated);
    setShowAddModal(false);
    setEditingService(null);
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

  return (
    <div className="flex flex-col h-screen w-screen bg-surface">
      <Titlebar
        activeService={services.find((s) => s.id === activeServiceId) ?? null}
        onReload={handleReloadService}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onShowUpdatePage={async () => {
          setShowUpdatePage(true);
          setActiveServiceId(null);
          await window.electronAPI?.hideService();
        }}
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
          onRemoveService={handleRemoveService}
          onEditService={handleEditService}
        />
        {/* BrowserView renders natively on top of this area */}
        <div className="flex-1 relative">
          {!activeServiceId && !showUpdatePage && (
            <WelcomeScreen onAddService={() => setShowAddModal(true)} />
          )}
          {showUpdatePage && !activeServiceId && <UpdatePage />}
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
