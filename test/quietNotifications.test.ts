import { describe, expect, it } from "vitest";
import { quietNotificationsScript } from "../electron/quietNotifications";

// A stand-in page: records what reaches the real Notification constructor and
// showNotification, the way the OS would receive them.
function fakePage() {
  const shown: { title: string; options?: NotificationOptions }[] = [];
  class Notification {
    static permission = "granted";
    static requestPermission = () => Promise.resolve("granted");
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, options });
    }
  }
  class ServiceWorkerRegistration {
    showNotification(title: string, options?: NotificationOptions) {
      shown.push({ title, options });
      return Promise.resolve();
    }
  }
  const window: Record<string, unknown> = { Notification, ServiceWorkerRegistration };
  const run = (script: string) => new Function("window", script)(window);
  const notify = (title: string, options?: NotificationOptions) =>
    new (window.Notification as typeof Notification)(title, options);
  return { window, shown, run, notify, ServiceWorkerRegistration, Notification };
}

describe("quietNotificationsScript", () => {
  it("makes notifications silent while Sound is off", () => {
    const page = fakePage();
    page.run(quietNotificationsScript(true));
    page.notify("New message", { body: "hi" });
    expect(page.shown[0].options).toEqual({ body: "hi", silent: true });
  });

  it("leaves them alone while Sound is on", () => {
    const page = fakePage();
    page.run(quietNotificationsScript(false));
    page.notify("New message", { body: "hi" });
    expect(page.shown[0].options).toEqual({ body: "hi" });
  });

  it("follows the switch when it's run again, without wrapping twice", () => {
    const page = fakePage();
    page.run(quietNotificationsScript(false));
    const wrapped = page.window.Notification;
    page.run(quietNotificationsScript(true));
    expect(page.window.Notification).toBe(wrapped);
    page.notify("a");
    page.run(quietNotificationsScript(false));
    page.notify("b");
    expect(page.shown.map((n) => n.options?.silent)).toEqual([true, undefined]);
  });

  it("covers notifications shown through a service worker registration", async () => {
    const page = fakePage();
    page.run(quietNotificationsScript(true));
    await new page.ServiceWorkerRegistration().showNotification("New message");
    expect(page.shown[0].options).toEqual({ silent: true });
  });

  it("keeps what the page relies on: permission, requestPermission, instanceof", async () => {
    const page = fakePage();
    page.run(quietNotificationsScript(true));
    const Wrapped = page.window.Notification as typeof page.Notification;
    expect(Wrapped.permission).toBe("granted");
    await expect(Wrapped.requestPermission()).resolves.toBe("granted");
    expect(page.notify("x")).toBeInstanceOf(page.Notification);
  });
});
