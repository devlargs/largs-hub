import { useState, useCallback } from "react";
import { isInternalService, Service } from "./types";
import Sidebar from "./components/Sidebar";
import Titlebar from "./components/Titlebar";
import AddServiceModal from "./components/AddServiceModal";
import LinkPreviewModal from "./components/LinkPreviewModal";
import FindBar from "./components/FindBar";
import MessengerAutomationPanel from "./components/MessengerAutomationPanel";
import ContentPane, { AppPage } from "./components/ContentPane";
import LockScreen from "./components/LockScreen";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import { useNotificationStore } from "./store/notifications";
import type { ConfirmPrompt } from "./lib/appActions";
import {
  useAutomationTasks,
  useLinkPreview,
  useNotificationSync,
  useShortcutHints,
  useUiLayer,
  useWorkspaceLock,
  useZoomFactor,
} from "./hooks/useMainState";
import { useFindBar } from "./hooks/useFindBar";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useAutomationPanel } from "./hooks/useAutomationPanel";
import { useServiceEvents } from "./hooks/useServiceEvents";

function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [appPage, setAppPage] = useState<AppPage | null>(null);
  // The destructive prompts the service context menu asks for (issue #104).
  const [confirm, setConfirm] = useState<(ConfirmPrompt & { onConfirm: () => void }) | null>(null);
  const removeNotificationService = useNotificationStore((s) => s.removeService);

  const locked = useWorkspaceLock();
  const shortcutHints = useShortcutHints();
  const automationTasks = useAutomationTasks();
  const linkPreviewUrl = useLinkPreview();
  const zoomFactor = useZoomFactor(activeServiceId);
  const { findServiceId, openFind, closeFind } = useFindBar(activeServiceId);
  const activeService = services.find((s) => s.id === activeServiceId) ?? null;
  const automationPanel = useAutomationPanel(activeService);
  useNotificationSync();
  // Hide the service view so the modal renders above it
  useUiLayer(showAddModal);

  // Look up a service in the current list from a handler registered once.
  // Reading it through the state updater avoids a stale closure.
  const withService = useCallback((serviceId: string, fn: (service: Service) => void) => {
    setServices((current) => {
      const svc = current.find((s) => s.id === serviceId);
      if (svc) fn(svc);
      return current;
    });
  }, []);

  const showAppPage = useCallback(async (page: AppPage | null) => {
    setActiveServiceId(null);
    setAppPage(page);
    await window.electronAPI?.hideService();
  }, []);

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

  const handleSelectService = useCallback(
    (serviceId: string) => {
      setActiveServiceId(serviceId);
      setAppPage(null);
      withService(serviceId, (svc) => {
        if (isInternalService(svc) || svc.enabled === false) {
          // Internal services render as React pages — no web view to show
          window.electronAPI?.hideService();
        } else {
          window.electronAPI?.showService(serviceId);
        }
      });
    },
    [withService],
  );

  useServiceEvents({
    setServices,
    withService,
    onRestored: setActiveServiceId,
    onActivated: (serviceId) => {
      setActiveServiceId(serviceId);
      setAppPage(null);
    },
    onEdit: (svc) => {
      setEditingService(svc);
      setShowAddModal(true);
    },
    onConfirm: (prompt, onConfirm) => setConfirm({ ...prompt, onConfirm }),
    onRemove: (serviceId) => void handleRemoveService(serviceId),
    onShowUpdatePage: () => void showAppPage("settings"),
  });

  useAppShortcuts({
    locked,
    activeServiceId,
    onFind: openFind,
    // Ctrl+N picks the Nth service in sidebar order, disabled ones included
    onSwitch: (index) => {
      setServices((current) => {
        const service = current[index];
        if (service) handleSelectService(service.id);
        return current;
      });
    },
  });

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

  // Runs `fn` on the active service, if there is one
  const onActive = (fn: (serviceId: string) => void) => () => {
    if (activeServiceId) fn(activeServiceId);
  };

  return (
    <div className="flex flex-col h-screen w-screen">
      <Titlebar
        activeService={activeService}
        onReload={onActive((id) => window.electronAPI?.reloadService(id))}
        onGoBack={onActive((id) => window.electronAPI?.goBack(id))}
        onGoForward={onActive((id) => window.electronAPI?.goForward(id))}
        onOpenSettings={() => showAppPage("settings")}
        onOpenChangelog={() => showAppPage("changelog")}
        zoomFactor={zoomFactor}
        onResetZoom={onActive((id) => window.electronAPI?.stepServiceZoom(id, "reset"))}
        showAutomation={automationPanel.available}
        automationActive={automationTasks.some((t) => t.serviceId === activeServiceId)}
        onOpenAutomation={() => automationPanel.setOpen((open) => !open)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          services={services}
          activeServiceId={activeServiceId}
          showShortcutHints={shortcutHints && !locked}
          onSelectService={handleSelectService}
          onAddService={() => {
            setEditingService(null);
            return showAppPage(null);
          }}
          onReorderServices={handleReorderServices}
        />
        <ContentPane
          activeService={activeService}
          activeServiceId={activeServiceId}
          appPage={appPage}
          hasServices={services.length > 0}
          onAddService={() => setShowAddModal(true)}
          onRemoveService={handleRemoveService}
          onEnableService={async (svc) => {
            const updated = await window.electronAPI.toggleServiceEnabled(svc.id);
            setServices(updated);
            window.electronAPI?.showService(svc.id);
          }}
        />
      </div>
      {findServiceId && (
        <FindBar serviceId={findServiceId} onClose={() => closeFind(findServiceId)} />
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
      {automationPanel.open && activeServiceId && (
        <MessengerAutomationPanel
          serviceId={activeServiceId}
          tasks={automationTasks}
          onClose={() => automationPanel.setOpen(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          tone="danger"
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
