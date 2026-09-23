import { BrowserWindow, WebContentsView } from "electron";

// Runtime state shared by the serviceViews modules. window/ owns the window
// and the UI layer, and main.ts injects them via initServiceViews; everything else here
// is per-view bookkeeping that lives only as long as the process.

export interface ServiceViewDeps {
  getMainWindow(): BrowserWindow | null;
  getUiView(): WebContentsView | null;
  openLinkPreview(url: string, partition: string): void;
  // Every key a service view sees, for the Ctrl shortcut hints
  onKeyInput(input: Electron.Input): void;
}

let deps: ServiceViewDeps | null = null;

export function initServiceViews(d: ServiceViewDeps) {
  deps = d;
}

export function getDeps(): ServiceViewDeps | null {
  return deps;
}

export const serviceViews = new Map<string, WebContentsView>();

// When each service view last stopped being the active one — drives hibernation
// of idle views. The active view is exempt and carries no entry while active.
export const serviceLastActive = new Map<string, number>();

export const viewState = {
  activeServiceId: null as string | null,
  windowFocused: true,
  // Z-order rule (see CLAUDE.md): overlays can't reliably stack above service
  // views on Windows, so React modals hide the active view instead.
  // While the workspace is locked no service view may be on screen, whatever the
  // renderer asks for — the lock screen draws in the UI view, and a service view
  // would sit on top of it (issue #102).
  viewsSuppressed: false,
};

/** The session partition a service's view, call window and downloads share. */
export function partitionFor(serviceId: string): string {
  return `persist:service-${serviceId}`;
}

export function getServiceView(serviceId: string): WebContentsView | undefined {
  return serviceViews.get(serviceId);
}

export function getActiveServiceId(): string | null {
  return viewState.activeServiceId;
}

export function isWindowFocused(): boolean {
  return viewState.windowFocused;
}
