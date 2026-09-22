// Silences a service's native notifications while its Sound switch is off.
//
// Muting the view (setAudioMuted) only silences the page's own audio. The
// sound that comes with a notification is played by the OS for the native
// notification (Notification Center on macOS, a toast on Windows), so it has
// to be asked for per notification: the page's Notification calls are wrapped
// to pass `silent: true`, which Electron hands on to the OS.
//
// The wrapper is installed once per document and reads a flag, so toggling
// Sound just re-runs the script with the new value — no reload. Kept pure (a
// string builder) so it can be tested without Electron.

/**
 * The main-world script for a service page. Safe to run any number of times:
 * the first run installs the wrappers, every run sets the flag.
 */
export function quietNotificationsScript(silent: boolean): string {
  return `(() => {
  const w = window;
  w.__largsHubSilentNotifications = ${silent ? "true" : "false"};
  if (w.__largsHubQuietInstalled) return;
  w.__largsHubQuietInstalled = true;
  const quiet = (options) =>
    w.__largsHubSilentNotifications ? Object.assign({}, options, { silent: true }) : options;
  const Native = w.Notification;
  if (typeof Native === "function") {
    // A subclass keeps Notification.permission, requestPermission and
    // instanceof checks working as the page expects.
    class Notification extends Native {
      constructor(title, options) {
        super(title, quiet(options));
      }
    }
    w.Notification = Notification;
  }
  const registration = w.ServiceWorkerRegistration && w.ServiceWorkerRegistration.prototype;
  if (registration && typeof registration.showNotification === "function") {
    const show = registration.showNotification;
    registration.showNotification = function (title, options) {
      return show.call(this, title, quiet(options));
    };
  }
})();`;
}
