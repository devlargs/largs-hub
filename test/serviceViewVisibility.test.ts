import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Service } from "../electron/shared/types";
import {
  initServiceViews,
  getActiveServiceId,
  getServiceView,
  serviceLastActive,
  serviceViews,
  viewState,
} from "../electron/serviceViews/state";
import * as visibility from "../electron/serviceViews/visibility";
import { APPLY_BLUR_SCRIPT, REMOVE_BLUR_SCRIPT } from "../electron/serviceViews/scripts";

// The glue that decides which service view is on screen (serviceViews/
// visibility.ts). Views, the window and the store are fakes: the point is the
// bookkeeping — what gets shown, hidden, focused and blurred, and that nothing
// shows through while the workspace is locked (issue #102).

// vi.mock factories are hoisted above the imports, so what they share with the
// tests has to be hoisted with them.
const { storeData, created } = vi.hoisted(() => ({
  storeData: { services: [] as Service[], wakeServicesAutomatically: false },
  created: new Map<string, FakeView>(),
}));

vi.mock("../electron/store", () => ({
  store: { get: (key: keyof typeof storeData) => storeData[key] },
  isInternalService: (s: { type?: string } | undefined) => s?.type === "notion-notes",
}));

vi.mock("../electron/notificationCounts", () => ({
  clearNotificationCount: vi.fn(),
}));

interface FakeView {
  visible: boolean;
  setVisible: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  webContents: {
    focus: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    isDestroyed: () => boolean;
    isCurrentlyAudible: () => boolean;
    executeJavaScript: ReturnType<typeof vi.fn>;
  };
}

function fakeView(): FakeView {
  const view: FakeView = {
    visible: true,
    setVisible: vi.fn((v: boolean) => {
      view.visible = v;
    }),
    setBounds: vi.fn(),
    webContents: {
      focus: vi.fn(),
      close: vi.fn(),
      isDestroyed: () => false,
      isCurrentlyAudible: () => false,
      executeJavaScript: vi.fn(() => Promise.resolve()),
    },
  };
  return view;
}

vi.mock("../electron/serviceViews/create", () => ({
  createServiceView: (service: Service) => {
    const view = fakeView();
    created.set(service.id, view);
    return view;
  },
}));

const service = (id: string, extra: Partial<Service> = {}): Service =>
  ({ id, name: id, url: `https://${id}.example.com`, ...extra }) as Service;

let mainWindow: {
  getContentSize: () => number[];
  contentView: {
    addChildView: ReturnType<typeof vi.fn>;
    removeChildView: ReturnType<typeof vi.fn>;
  };
};
let uiFocus: ReturnType<typeof vi.fn>;

const viewOf = (id: string) => created.get(id)!;
const ranScript = (view: FakeView, script: string) =>
  view.webContents.executeJavaScript.mock.calls.some(([code]) => code === script);

beforeEach(() => {
  created.clear();
  visibility.clearAllViewState();
  viewState.windowFocused = true;
  viewState.viewsSuppressed = false;
  storeData.services = [service("a"), service("b"), service("off", { enabled: false })];
  storeData.wakeServicesAutomatically = false;
  mainWindow = {
    getContentSize: () => [1200, 800],
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  };
  uiFocus = vi.fn();
  initServiceViews({
    getMainWindow: () => mainWindow as never,
    getUiView: () => ({ webContents: { focus: uiFocus, send: vi.fn() } }) as never,
    openLinkPreview: () => undefined,
    onKeyInput: () => undefined,
  });
});

describe("showService", () => {
  it("creates, shows and focuses the requested view", () => {
    visibility.showService("a");
    const view = viewOf("a");
    expect(getActiveServiceId()).toBe("a");
    expect(getServiceView("a")).toBe(view);
    expect(mainWindow.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.visible).toBe(true);
    expect(view.setBounds).toHaveBeenCalled();
    expect(view.webContents.focus).toHaveBeenCalled();
  });

  it("hides the previous view and starts its idle clock", () => {
    visibility.showService("a");
    visibility.showService("b");
    expect(viewOf("a").visible).toBe(false);
    expect(viewOf("b").visible).toBe(true);
    expect(serviceLastActive.get("a")).toBeTypeOf("number");
    expect(getActiveServiceId()).toBe("b");
  });

  it("reuses an existing view instead of creating another", () => {
    visibility.showService("a");
    const first = viewOf("a");
    visibility.showService("b");
    visibility.showService("a");
    expect(getServiceView("a")).toBe(first);
    expect(mainWindow.contentView.addChildView).toHaveBeenCalledTimes(2);
  });

  it("hands the keyboard back to the UI for a disabled service", () => {
    visibility.showService("a");
    visibility.showService("off");
    expect(viewOf("a").visible).toBe(false);
    expect(created.has("off")).toBe(false);
    expect(getActiveServiceId()).toBeNull();
    expect(uiFocus).toHaveBeenCalled();
  });

  it("blurs instead of focusing when the window is unfocused and blur is on", () => {
    storeData.services = [service("a", { blurWhenInactive: true })];
    viewState.windowFocused = false;
    visibility.showService("a");
    const view = viewOf("a");
    expect(view.webContents.focus).not.toHaveBeenCalled();
    expect(ranScript(view, APPLY_BLUR_SCRIPT)).toBe(true);
  });

  it("does nothing without a window", () => {
    initServiceViews({
      getMainWindow: () => null,
      getUiView: () => null,
      openLinkPreview: () => undefined,
      onKeyInput: () => undefined,
    });
    visibility.showService("a");
    expect(created.size).toBe(0);
    expect(getActiveServiceId()).toBeNull();
  });
});

describe("suppression while locked", () => {
  it("hides the active view and keeps it hidden whatever the renderer asks", () => {
    visibility.showService("a");
    visibility.setViewsSuppressed(true);
    expect(viewOf("a").visible).toBe(false);

    // A modal closing calls setActiveViewVisible(true) — must not reveal it.
    visibility.setActiveViewVisible(true);
    expect(viewOf("a").visible).toBe(false);
  });

  it("keeps a service switched to while locked hidden and unfocused", () => {
    visibility.setViewsSuppressed(true);
    visibility.showService("a");
    const view = viewOf("a");
    expect(view.visible).toBe(false);
    expect(view.webContents.focus).not.toHaveBeenCalled();
    expect(getActiveServiceId()).toBe("a");
  });

  it("shows the active view again on unlock", () => {
    visibility.showService("a");
    visibility.setViewsSuppressed(true);
    visibility.setViewsSuppressed(false);
    expect(viewOf("a").visible).toBe(true);
  });

  it("lets modals hide and restore the view while unlocked", () => {
    visibility.showService("a");
    visibility.setActiveViewVisible(false);
    expect(viewOf("a").visible).toBe(false);
    visibility.setActiveViewVisible(true);
    expect(viewOf("a").visible).toBe(true);
  });
});

describe("hideActiveService", () => {
  it("hides the view, clears the active id and focuses the UI", () => {
    visibility.showService("a");
    visibility.hideActiveService();
    expect(viewOf("a").visible).toBe(false);
    expect(getActiveServiceId()).toBeNull();
    expect(serviceLastActive.get("a")).toBeTypeOf("number");
    expect(uiFocus).toHaveBeenCalled();
  });

  it("never pulls focus to the UI while the window is unfocused", () => {
    visibility.showService("a");
    viewState.windowFocused = false;
    visibility.hideActiveService();
    expect(uiFocus).not.toHaveBeenCalled();
  });
});

describe("window focus and blur", () => {
  it("blurs the active view on window blur only when the service asks for it", () => {
    storeData.services = [service("a", { blurWhenInactive: true }), service("b")];
    visibility.showService("a");
    visibility.handleWindowBlur();
    expect(viewState.windowFocused).toBe(false);
    expect(ranScript(viewOf("a"), APPLY_BLUR_SCRIPT)).toBe(true);

    visibility.showService("b");
    visibility.handleWindowBlur();
    expect(ranScript(viewOf("b"), APPLY_BLUR_SCRIPT)).toBe(false);
  });

  it("removes the blur and refocuses the active view on window focus", () => {
    visibility.showService("a");
    const view = viewOf("a");
    view.webContents.focus.mockClear();
    viewState.windowFocused = false;
    visibility.handleWindowFocus();
    expect(viewState.windowFocused).toBe(true);
    expect(ranScript(view, REMOVE_BLUR_SCRIPT)).toBe(true);
    expect(view.webContents.focus).toHaveBeenCalled();
  });
});

describe("destroyServiceView", () => {
  it("tears the view down and forgets it, clearing the active id", () => {
    visibility.showService("a");
    const view = viewOf("a");
    visibility.destroyServiceView("a");
    expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalled();
    expect(serviceViews.has("a")).toBe(false);
    expect(serviceLastActive.has("a")).toBe(false);
    expect(getActiveServiceId()).toBeNull();
  });

  it("leaves the active id alone when destroying a background view", () => {
    visibility.showService("a");
    visibility.showService("b");
    visibility.destroyServiceView("a");
    expect(getActiveServiceId()).toBe("b");
  });
});

describe("preloadServices", () => {
  it("creates hidden views for enabled web services when waking is on", () => {
    storeData.wakeServicesAutomatically = true;
    storeData.services = [
      service("a"),
      service("off", { enabled: false }),
      service("notes", { type: "notion-notes" } as Partial<Service>),
    ];
    visibility.preloadServices();
    expect([...created.keys()]).toEqual(["a"]);
    expect(viewOf("a").visible).toBe(false);
    expect(getActiveServiceId()).toBeNull();
  });

  it("does nothing when waking is off", () => {
    visibility.preloadServices();
    expect(created.size).toBe(0);
  });
});
