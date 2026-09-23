// Service-view lifecycle: creation (with UA spoofing, permission policy,
// notification extraction, popup handling), show/hide switching, hibernation,
// and layout. These modules own all per-view runtime state; window/ owns the
// window and UI layer, and main.ts injects them via initServiceViews.
//
//   state.ts        shared runtime state + the deps main injects
//   create.ts       building a view: session, UA, permissions, popups, keys
//   visibility.ts   switching, hiding, lock suppression, focus/blur, teardown
//   hibernation.ts  idle-view sweep
//   layout.ts       view bounds, find-bar strip, automation split
//   findZoom.ts     find in page, per-service zoom
//   polling.ts      badge extraction and its poll rate
//   overlays.ts     blur / privacy overlays
//   callWindow.ts   Messenger call popup window + Call Cycle hooks
//   contextMenu.ts  native right-click menu
//   scripts.ts      injected page scripts (pure, snapshot-tested)

export { initServiceViews, getServiceView, getActiveServiceId, isWindowFocused } from "./state";
export {
  setAutomationSplitOpen,
  getAutomationPanelWidth,
  pushAutomationWidth,
  setFindBarOpen,
  repositionActiveView,
} from "./layout";
export {
  findInService,
  stopFindInService,
  getServiceZoom,
  setServiceZoom,
  stepServiceZoom,
} from "./findZoom";
export {
  applyBlurToView,
  removeBlurFromView,
  applyPrivacyToView,
  removePrivacyFromView,
  refreshPrivacyOverlays,
} from "./overlays";
export { refreshPollRates, setWindowMinimized, watchPowerForPolling } from "./polling";
export { armAutomationCall, closeCallWindow, monitorCallForAnswer } from "./callWindow";
export {
  setViewsSuppressed,
  setActiveViewVisible,
  handleWindowFocus,
  handleWindowBlur,
  showService,
  hideActiveService,
  destroyServiceView,
  preloadServices,
  clearAllViewState,
  isAnyServiceAudible,
} from "./visibility";
export { startHibernationSweep, stopHibernationSweep } from "./hibernation";
