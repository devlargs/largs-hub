import { useState, useCallback, useEffect, useMemo } from "react";
import { isInternalService, Service } from "./types";
import { hiddenServices, sidebarServices } from "@shared/serviceVisibility";
import { withVisibleOrder } from "./lib/serviceOrder";
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

  const { locked, canLock } = useWorkspaceLock();
  const shortcutHints = useShortcutHints();
  const automationTasks = useAutomationTasks();
  const linkPreviewUrl = useLinkPreview();
  const zoomFactor = useZoomFactor(activeServiceId);
  const { findServiceId, openFind, closeFind } = useFindBar(activeServiceId);
  const activeService = services.find((s) => s.id === activeServiceId) ?? null;
  const shownServices = useMemo(() => sidebarServices(services), [services]);
  const hidden = useMemo(() => hiddenServices(services), [services]);
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

  // The sidebar's Home button and Ctrl+1
  const goHome = useCallback(() => {
    setEditingService(null);
    return showAppPage(null);
  }, [showAppPage]);

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
    // Ctrl+1 in a service view: main has already hidden it
    onHome: () => {
      setEditingService(null);
      setActiveServiceId(null);
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
    // Ctrl+1 is Home; Ctrl+N picks the (N-1)th service in sidebar order,
    // disabled ones included, hidden ones not
    onSwitch: (target) => {
      if (target.kind === "home") {
        void goHome();
        return;
      }
      setServices((current) => {
        const service = sidebarServices(current)[target.index];
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

  // A hidden service has no sidebar button to show it's the one on screen or
  // to get back to it, so hiding the active service (or relaunching onto one)
  // goes Home. Unhiding is in Settings → Privacy.
  useEffect(() => {
    if (activeService?.hidden) void goHome();
  }, [activeService?.hidden, goHome]);

  const handleUnhideService = useCallback(async (serviceId: string) => {
    setServices(await window.electronAPI.unhideService(serviceId));
  }, []);

  // The sidebar reorders only what it shows; put the hidden services back in
  // their places so main keeps them.
  const handleReorderServices = useCallback(
    async (visibleIds: string[]) => {
      const allIds = services.map((s) => s.id);
      const updated = await window.electronAPI.reorderServices(
        withVisibleOrder(allIds, visibleIds),
      );
      setServices(updated);
    },
    [services],
  );

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
          services={shownServices}
          activeServiceId={activeServiceId}
          showShortcutHints={shortcutHints && !locked}
          canLock={canLock}
          onSelectService={handleSelectService}
          onAddService={goHome}
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
          hiddenServices={hidden}
          onUnhideService={handleUnhideService}
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
      {automationPanel.open && activeServiceId && automationPanel.platform && (
        <MessengerAutomationPanel
          serviceId={activeServiceId}
          platform={automationPanel.platform}
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
