import { store, isInternalService } from "../store";
import { showsWebView } from "../serviceFlags";
import { clearNotificationCount } from "../notificationCounts";
import { getDeps, serviceLastActive, serviceViews, viewState } from "./state";
import { getViewBounds } from "./layout";
import {
  applyBlurToView,
  applyPrivacyToView,
  isBlurWhenInactive,
  isPrivacyMode,
  removeBlurFromView,
  removePrivacyFromView,
} from "./overlays";
import { refreshPollRates } from "./polling";
import { closeCallWindowForTeardown, isAnyCallAudible } from "./callWindow";
import { createServiceView } from "./create";

// Which service view is on screen: switching, hiding, suppression while the
// workspace is locked, window focus/blur, and creating/destroying views.
// Hibernation (hibernation.ts) reads the idle clock this module keeps in
// serviceLastActive.

export function setViewsSuppressed(suppressed: boolean) {
  viewState.viewsSuppressed = suppressed;
  setActiveViewVisible(!suppressed);
}

export function setActiveViewVisible(visible: boolean) {
  if (!viewState.activeServiceId) return;
  const view = serviceViews.get(viewState.activeServiceId);
  if (view) view.setVisible(visible && !viewState.viewsSuppressed);
}

// When the window regains focus (e.g. Alt+Tab), focus the active service view
// so keyboard input goes to it (e.g. typing in a Messenger chat)
export function handleWindowFocus() {
  viewState.windowFocused = true;
  refreshPollRates(); // focus raises the active view's poll rate
  if (viewState.activeServiceId) {
    const view = serviceViews.get(viewState.activeServiceId);
    if (view && !view.webContents.isDestroyed()) {
      removeBlurFromView(view);
      view.webContents.focus();
    }
  }
}

// When the window loses focus, blur the active service view (if enabled for that service)
export function handleWindowBlur() {
  viewState.windowFocused = false;
  if (viewState.activeServiceId && isBlurWhenInactive(viewState.activeServiceId)) {
    const view = serviceViews.get(viewState.activeServiceId);
    if (view && !view.webContents.isDestroyed()) {
      applyBlurToView(view);
    }
  }
  refreshPollRates(); // an unfocused window polls slower
}

export function showService(serviceId: string) {
  const mainWindow = getDeps()?.getMainWindow();
  if (!mainWindow) return;

  // Internal and disabled services render as React pages in the UI view —
  // just make sure no web view is covering them. This has to be settled before
  // the current view is hidden: bailing out after hiding it left keyboard
  // focus in a view nobody could see, so Ctrl+1-9 stopped working (the UI's
  // own key handler never got the keys) and main still thought the hidden
  // service was active.
  const requested = store.get("services").find((s) => s.id === serviceId);
  if (!showsWebView(requested)) {
    hideActiveService();
    return;
  }

  // Hide current view
  if (viewState.activeServiceId) {
    const currentView = serviceViews.get(viewState.activeServiceId);
    if (currentView) {
      currentView.setVisible(false);
    }
    // Start the idle clock for the service we're switching away from
    serviceLastActive.set(viewState.activeServiceId, Date.now());
  }

  // Show or create requested view
  let view = serviceViews.get(serviceId);
  if (!view) {
    view = createServiceView(requested, showService);
    serviceViews.set(serviceId, view);
    serviceLastActive.set(serviceId, Date.now());
    mainWindow.contentView.addChildView(view);
  }

  view.setVisible(!viewState.viewsSuppressed);
  view.setBounds(getViewBounds());
  if (isPrivacyMode(serviceId)) applyPrivacyToView(view);
  else removePrivacyFromView(view);
  if (viewState.windowFocused && !viewState.viewsSuppressed) {
    view.webContents.focus();
  } else {
    if (isBlurWhenInactive(serviceId)) applyBlurToView(view);
    else removeBlurFromView(view);
  }
  viewState.activeServiceId = serviceId;
  refreshPollRates(); // the newly active view polls faster, the old one slower
}

export function hideActiveService() {
  const deps = getDeps();
  if (!deps?.getMainWindow()) return;
  // With no service view on screen, the keyboard belongs to the UI: a hidden
  // view keeps focus otherwise, so keys land in a page nobody can see and the
  // UI's shortcuts (Ctrl+1-9, zoom, find) never fire. Only while the window
  // has focus, so this never pulls the app forward on its own.
  if (viewState.windowFocused) deps.getUiView()?.webContents.focus();
  if (!viewState.activeServiceId) return;
  const currentView = serviceViews.get(viewState.activeServiceId);
  if (currentView) {
    currentView.setVisible(false);
  }
  // Start the idle clock for the service we're leaving
  serviceLastActive.set(viewState.activeServiceId, Date.now());
  viewState.activeServiceId = null;
  refreshPollRates(); // nothing is active now, so every view drops to background
}

// Destroy a service's live view (used on removal, disable, URL change and
// hibernation). The stored service is untouched; pass clearCounts to also drop
// its badge.
export function destroyServiceView(serviceId: string, options?: { clearCounts?: boolean }) {
  const view = serviceViews.get(serviceId);
  if (view) {
    if (viewState.activeServiceId === serviceId) {
      viewState.activeServiceId = null;
    }
    const mainWindow = getDeps()?.getMainWindow();
    if (mainWindow) {
      mainWindow.contentView.removeChildView(view);
    }
    view.webContents.close();
    serviceViews.delete(serviceId);
    serviceLastActive.delete(serviceId);
  }
  // Close any in-app call window tied to this service's partition.
  closeCallWindowForTeardown(serviceId);
  if (options?.clearCounts) {
    clearNotificationCount(serviceId);
  }
}

// Pre-load all saved services so they're warm on startup (if enabled)
export function preloadServices() {
  const mainWindow = getDeps()?.getMainWindow();
  if (!store.get("wakeServicesAutomatically")) return;
  const services = store.get("services");
  for (const service of services) {
    if (isInternalService(service)) continue; // internal — no web view
    if (!serviceViews.has(service.id) && mainWindow && service.enabled !== false) {
      const view = createServiceView(service, showService);
      serviceViews.set(service.id, view);
      serviceLastActive.set(service.id, Date.now());
      mainWindow.contentView.addChildView(view);
      view.setVisible(false);
    }
  }
}

// Drop all runtime view state (window closed). Views themselves die with the
// window; this just clears the bookkeeping.
export function clearAllViewState() {
  serviceViews.clear();
  serviceLastActive.clear();
  viewState.activeServiceId = null;
}

/** Whether any service view is currently playing audio (issue #73). */
export function isAnyServiceAudible(): boolean {
  for (const view of serviceViews.values()) {
    if (!view.webContents.isDestroyed() && view.webContents.isCurrentlyAudible()) return true;
  }
  return isAnyCallAudible();
}
