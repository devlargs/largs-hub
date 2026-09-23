import { BrowserWindow, WebContentsView, shell } from "electron";
import { getDeps, partitionFor } from "./state";
import {
  AUTO_START_CALL_SCRIPT,
  HANGUP_SCRIPT,
  REMOVE_CALL_OVERLAY_SCRIPT,
  buildCallOverlayScript,
} from "./scripts";

// Messenger/Facebook calls in a dedicated in-app window (issue #59), plus the
// Call Cycle automation's hooks into it: arming, answer monitoring, hang-up.

// One in-app call window per service partition. Reused so a call cycle that
// re-clicks the call button focuses the open call instead of stacking windows.
const callWindows = new Map<string, BrowserWindow>();

// Partitions whose next call popup is being opened by the Call Cycle
// automation, which arms this just before it clicks the call button;
// openCallWindow consumes it and opens the popup muted and minimized (you're
// not actively on a cycle call until it's answered). Manual calls (clicked in
// Messenger by the user) never arm it, so they stay audible and visible.
const automationCallArmed = new Set<string>();

export function armAutomationCall(serviceId: string) {
  const partition = partitionFor(serviceId);
  automationCallArmed.add(partition);
  // Safety net: if the popup never opens, don't leave the flag to affect a
  // later manual call.
  setTimeout(() => automationCallArmed.delete(partition), 10_000);
}

// Messenger/Facebook calls: Meta's web client opens an about:blank popup and
// then points it at its own /groupcall/ page — but its opener keeps resetting
// that popup back to about:blank, so the call never renders inside that popup.
// This is a well-known limitation of Electron web-app wrappers. Rather than
// leave a broken blank window, we grab the real call URL as soon as the popup
// navigates to it and reopen it in a fresh in-app call window (no opener link,
// so Meta can't reset it) where WebRTC works fully (issue #59).
// The view's setWindowOpenHandler allows the hidden popup so this navigation
// can be observed.
export function attachCallPopupHandler(
  view: WebContentsView,
  partition: string,
  spoofedUA: string,
) {
  view.webContents.on("did-create-window", (childWindow) => {
    childWindow.hide(); // keep it hidden until we know what it is
    let settled = false;
    const onNavigate = (event: Electron.Event, navUrl: string) => {
      if (settled || !/^https?:/i.test(navUrl)) return; // ignore the about:blank spin
      settled = true;
      if (/\/(group)?call/i.test(navUrl)) {
        // A call: reopen it in a dedicated in-app window, where WebRTC works
        // and Meta's opener can't blank it out.
        event.preventDefault();
        openCallWindow(navUrl, partition, spoofedUA);
        if (!childWindow.isDestroyed()) childWindow.close();
      } else {
        // Some other genuine popup (e.g. an auth window) — let it show.
        if (!childWindow.isDestroyed()) childWindow.show();
      }
    };
    childWindow.webContents.on("will-navigate", onNavigate);
    childWindow.webContents.on("will-redirect", onNavigate);
    // If the popup only ever spins on about:blank, don't leak the hidden window.
    const leakGuard = setTimeout(() => {
      if (!settled && !childWindow.isDestroyed()) childWindow.close();
    }, 15_000);
    childWindow.on("closed", () => clearTimeout(leakGuard));
  });
}

// Open a Messenger/Facebook call in a dedicated in-app BrowserWindow instead of
// the system browser. A fresh window with no window.opener link to the service
// page can't be reset back to about:blank by Meta's opener (the reason in-view
// rendering fails — see attachCallPopupHandler), and it shares the service's
// session partition so the user stays logged in. WebRTC + camera/mic work
// because it's a real Chromium window and the partition's permission handler
// already allows media for these hosts.
function openCallWindow(callUrl: string, partition: string, spoofedUA: string) {
  // Consume the Call Cycle flag (if armed). Manual calls never arm it, so
  // isAutomationCall is false and the popup stays audible and visible.
  const isAutomationCall = automationCallArmed.delete(partition);

  const existing = callWindows.get(partition);
  if (existing && !existing.isDestroyed()) {
    if (isAutomationCall) existing.webContents.setAudioMuted(true);
    existing.loadURL(callUrl);
    if (isAutomationCall) {
      // Keep the cycle out of the way — never steal focus, stay minimized.
      if (!existing.isMinimized()) existing.minimize();
    } else {
      existing.show();
      existing.focus();
    }
    return;
  }

  const mainWindow = getDeps()?.getMainWindow();
  const callWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 480,
    minHeight: 400,
    title: "Call",
    backgroundColor: "#181825",
    autoHideMenuBar: true,
    // Shown explicitly below so cycle calls can go straight to minimized
    // without flashing on screen first.
    show: false,
    ...(mainWindow ? { parent: mainWindow } : {}),
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  callWindow.setMenuBarVisibility(false);
  callWindow.webContents.setUserAgent(spoofedUA);
  if (isAutomationCall) callWindow.webContents.setAudioMuted(true); // silence cycle calls

  // Cycle calls open minimized (and never take focus): the popup only matters
  // once someone picks up, and monitorCallForAnswer restores it on answer.
  // Manual calls open normally.
  callWindow.once("ready-to-show", () => {
    if (callWindow.isDestroyed()) return;
    if (isAutomationCall) {
      callWindow.showInactive();
      callWindow.minimize();
    } else {
      callWindow.show();
    }
  });
  // Keep the call contained: nested popups go to the system browser rather than
  // spawning more app windows.
  callWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Messenger's call page arms a beforeunload guard while a call is live, which
  // would otherwise pop a "Leave site?" prompt and block the window from
  // closing (both when the cycle hangs up and when the user clicks X). Ignore
  // it so the window can always close.
  callWindow.webContents.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });
  callWindow.on("closed", () => {
    if (callWindows.get(partition) === callWindow) {
      callWindows.delete(partition);
    }
  });

  // Auto-click "Start call" so the call actually connects instead of parking on
  // the "Ready to call?" screen. Runs on each main-frame load; once in-call the
  // button is gone, so it's a no-op — which also makes the reused-window path
  // (loadURL above) auto-start correctly.
  callWindow.webContents.on("did-finish-load", () => {
    if (callWindow.isDestroyed()) return;
    callWindow.webContents.executeJavaScript(AUTO_START_CALL_SCRIPT, true).catch(() => {});
  });

  callWindows.set(partition, callWindow);
  callWindow.loadURL(callUrl);
}

// Close and forget the in-app call window for a service, if one is open. Used
// to hang up an unanswered ring, and on cycle-stop.
export function closeCallWindow(serviceId: string) {
  const partition = partitionFor(serviceId);
  const win = callWindows.get(partition);
  callWindows.delete(partition); // forget now so it can't be reused mid-close
  if (!win || win.isDestroyed()) return;
  // Hang up in-page first so the call ends cleanly (callee stops ringing), then
  // force the window shut. destroy() bypasses the beforeunload guard that
  // blocks window.close() while a call is live, so the popup always closes.
  win.webContents
    .executeJavaScript(HANGUP_SCRIPT, true)
    .catch(() => {})
    .finally(() => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy();
      }, 400);
    });
}

// View teardown: close the window plainly; its "closed" handler forgets it.
export function closeCallWindowForTeardown(serviceId: string) {
  const callWindow = callWindows.get(partitionFor(serviceId));
  if (callWindow && !callWindow.isDestroyed()) callWindow.close();
}

export function isAnyCallAudible(): boolean {
  for (const callWindow of callWindows.values()) {
    if (!callWindow.isDestroyed() && callWindow.webContents.isCurrentlyAudible()) return true;
  }
  return false;
}

// Watch a freshly-started call for an answer while showing a countdown to
// hang-up on the popup. Resolves true once the call connects (a running
// duration timer is observed to advance), or false if timeoutMs elapses first
// — in which case the popup is closed, hanging up the unanswered outgoing call.
// Best-effort: detection keys on Messenger's call timer, so a UI overhaul there
// could require updating buildCallOverlayScript.
export function monitorCallForAnswer(serviceId: string, timeoutMs: number): Promise<boolean> {
  const partition = partitionFor(serviceId);
  const POLL_MS = 1000;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let lastTimer: string | null = null;
    const tick = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) {
        closeCallWindow(serviceId); // no answer in the window — hang up
        resolve(false);
        return;
      }
      const win = callWindows.get(partition);
      if (win && !win.isDestroyed()) {
        const remainingSec = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
        try {
          const timer: string | null = await win.webContents.executeJavaScript(
            buildCallOverlayScript(remainingSec),
            true,
          );
          // Two different non-null reads = a timer that's counting = connected.
          if (timer && lastTimer && timer !== lastTimer) {
            // Answered — drop the countdown pill and keep the call open. The
            // popup opened minimized for the cycle, so surface it now that
            // there's someone on the other end.
            await win.webContents
              .executeJavaScript(REMOVE_CALL_OVERLAY_SCRIPT, true)
              .catch(() => {});
            if (!win.isDestroyed()) {
              if (win.isMinimized()) win.restore();
              win.show();
              win.focus();
            }
            resolve(true);
            return;
          }
          lastTimer = timer;
        } catch {
          // window navigating/closing — ignore this tick
        }
      } else if (elapsed > 8_000) {
        // Popup never opened (or was closed) well after the click — treat as
        // no-answer so the cycle can try again.
        resolve(false);
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}
