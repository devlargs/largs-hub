import { app, BrowserWindow, net, session } from "electron";
import { pathToFileURL } from "url";
import { customIconsDir, resolveCustomIconPath, sweepOrphanedIcons } from "./customIcons";
import { store } from "./store";
import { registerMessengerAutomation } from "./messengerAutomation";
import { registerUpdater } from "./updater";
import { registerServicesIpc } from "./ipc/services";
import { sweepOrphanedPartitions } from "./partitions";
import { isQuitting, isTrayAvailable, destroyTray } from "./tray";
import { installAppMenu } from "./devMode";
import { registerSettingsIpc } from "./ipc/settings";
import { registerSecurityIpc } from "./ipc/security";
import { registerListGroupsIpc } from "./ipc/listGroups";
import { addRecentEmoji, sanitizeRecentEmojis } from "./recentEmojis";
import { initDownloads } from "./downloads";
import { initNotificationCounts } from "./notificationCounts";
import {
  initServiceViews,
  getServiceView,
  setViewsSuppressed,
  monitorCallForAnswer,
  closeCallWindow,
  armAutomationCall,
} from "./serviceViews";
import {
  createWindow,
  getMainWindow,
  getUiView,
  openLinkPreview,
  registerWindowIpc,
  shortcutHints,
} from "./window";

// Entry point: wires the modules together and runs the app lifecycle.
//   window/               the frameless window, UI layer, link preview, window IPC
//   store.ts              persistent state + stored-shape validation
//   serviceViews/         service view lifecycle, switching, hibernation
//   messengerAutomation/  Messenger automation scheduler + IPC
//   downloads.ts          per-session download handling + completion toast
//   notificationCounts.ts badge state, debounce, taskbar overlay
//   badge-adapters/       per-service unread-count extraction
//   updater.ts            GitHub release check + installer download
//   ipc/services.ts       service CRUD/toggles/navigation/context menu
//   ipc/settings.ts       theme, settings, custom icons, settings menu
//   ipc/security.ts       workspace lock: master password + auto-lock timer

app.setName("Largs Hub");
// Must match build.appId in package.json — Windows keys taskbar overlays and
// toast notifications off this ID, and a mismatch breaks both silently (#58).
app.setAppUserModelId("com.largshub.app");

// --- Module wiring -----------------------------------------------------------

initNotificationCounts({
  getMainWindow,
  getUiView,
  isServiceNotificationsEnabled: (serviceId) =>
    store.get("services").find((s) => s.id === serviceId)?.notificationsEnabled !== false,
});

initDownloads({ getMainWindow });

initServiceViews({
  getMainWindow,
  getUiView,
  openLinkPreview,
  onKeyInput: (input) => shortcutHints.handleInput(input),
});

registerServicesIpc({ getMainWindow, getUiView });
registerSettingsIpc({ getMainWindow, getUiView });
registerSecurityIpc({
  getUiView,
  onLockedChanged: (locked) => setViewsSuppressed(locked),
});
registerListGroupsIpc();
registerUpdater({ getMainWindow, getUiView });
registerWindowIpc();

// Messenger automation (scheduled/interval sends, call cycles)
registerMessengerAutomation({
  getServiceView: (serviceId) => getServiceView(serviceId),
  getServices: () => store.get("services"),
  getUiView,
  monitorCallForAnswer: (serviceId, timeoutMs) => monitorCallForAnswer(serviceId, timeoutMs),
  closeCallWindow: (serviceId) => closeCallWindow(serviceId),
  armAutomationCall: (serviceId) => armAutomationCall(serviceId),
  loadPersistedTasks: () => store.get("automationTasks"),
  savePersistedTasks: (tasks) => store.set("automationTasks", tasks),
  loadPersistedAutoStops: () => store.get("automationAutoStops"),
  savePersistedAutoStops: (autoStops) => store.set("automationAutoStops", autoStops),
  getServiceIds: () => store.get("services").map((s) => s.id),
  getRecentEmojis: () => sanitizeRecentEmojis(store.get("recentEmojis")),
  recordRecentEmoji: (emoji) => {
    const updated = addRecentEmoji(store.get("recentEmojis"), emoji);
    store.set("recentEmojis", updated);
    return updated;
  },
});

// --- App lifecycle -------------------------------------------------------------

app.whenReady().then(() => {
  installAppMenu(); // no DevTools or reload in packaged builds (issue #111)
  // Serves uploaded service icons to the UI view.
  //
  // Registered on the *default* session rather than app-wide (issue #67).
  // Service views and the link preview each run in their own partition, so
  // the scheme simply doesn't exist for them — a hostile page inside a
  // service view can't reach this handler at all. The UI view is the only
  // thing on the default session, and the only caller that needs it.
  session.defaultSession.protocol.handle("custom-icon", (request) => {
    const requested = decodeURIComponent(request.url.replace(/^custom-icon:\/\//, ""));
    // Same containment check the IPC side uses — a name that resolves outside
    // custom-icons/ is refused rather than read off disk.
    const filePath = resolveCustomIconPath(requested, customIconsDir());
    if (!filePath) return new Response(null, { status: 404 });
    // pathToFileURL, not string concatenation: it escapes spaces, "#", and
    // Windows separators that would otherwise corrupt the URL.
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // Reclaim session partitions left behind by services removed before removal
  // wiped them. Runs before any service view opens a session, so nothing being
  // deleted is in use.
  sweepOrphanedPartitions(store.get("services").map((s) => s.id));

  // Reclaim uploaded icons no service points at any more, including ones left
  // behind by versions that never cleaned up on replace or remove (issue #70).
  sweepOrphanedIcons(store.get("services"));

  createWindow();
});

app.on("window-all-closed", () => {
  // A tray-resident app has deliberately hidden its window; quitting here would
  // defeat the point (issue #90). The tray's own Quit sets the flag.
  if (isTrayAvailable() && !isQuitting()) return;
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  destroyTray();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
