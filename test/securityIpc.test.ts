import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityResult, SecurityState, SecurityUpdate } from "../electron/shared/types";
import { hashMasterPassword } from "../electron/masterPassword";
import { FIRST_BLOCK_MS } from "../electron/lockPolicy";

// The workspace lock's IPC handlers (ipc/security.ts), driven through fakes of
// ipcMain and the store (issue #111): nothing but unlock-app gets past the lock
// screen, turning the lock off needs the password, and wrong passwords are
// throttled in the main process.

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const { handlers, storeData } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  storeData: new Map<string, unknown>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    on: () => undefined,
  },
  powerMonitor: { on: () => undefined },
}));

vi.mock("../electron/store", () => ({
  store: {
    get: (key: string) => storeData.get(key),
    set: (key: string, value: unknown) => storeData.set(key, value),
  },
}));

vi.mock("../electron/appOrigin", () => ({ isFromApp: () => true }));

const PASSWORD = "correct horse";
const credential = await hashMasterPassword(PASSWORD);

const call = <T>(channel: string, ...args: unknown[]) =>
  Promise.resolve(handlers.get(channel)!({}, ...args)) as Promise<T>;
const state = () => call<SecurityState>("get-security-state");

// A fresh module per test: the lock state lives in module scope.
async function register(options: { enabled: boolean; throttle?: unknown }) {
  handlers.clear();
  storeData.clear();
  storeData.set("securityControlsEnabled", options.enabled);
  storeData.set("masterPasswordCredential", credential);
  storeData.set("lockDelayMinutes", 10);
  storeData.set("unlockThrottle", options.throttle ?? { failures: 0, blockedUntil: null });
  vi.resetModules();
  const { registerSecurityIpc } = await import("../electron/ipc/security");
  registerSecurityIpc({ getUiView: () => null, onLockedChanged: () => undefined });
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("while locked", () => {
  // Security controls on at launch means the app starts locked.
  beforeEach(() => register({ enabled: true }));

  it("starts on the lock screen", async () => {
    expect((await state()).locked).toBe(true);
  });

  it("refuses to turn security controls off, even with the right password", async () => {
    const result = await call<SecurityUpdate>("set-security-enabled", false, PASSWORD);
    expect(result.ok).toBe(false);
    expect(result.state).toMatchObject({ enabled: true, locked: true });
    expect(storeData.get("securityControlsEnabled")).toBe(true);
  });

  it("refuses to change the lock delay", async () => {
    await call("set-lock-delay", 30);
    expect(storeData.get("lockDelayMinutes")).toBe(10);
  });

  it("refuses to change the password", async () => {
    const result = await call<SecurityResult>("set-master-password", {
      currentPassword: PASSWORD,
      password: "new password",
      confirm: "new password",
    });
    expect(result.ok).toBe(false);
    expect(storeData.get("masterPasswordCredential")).toBe(credential);
  });

  it("opens with the right password, and only that", async () => {
    expect((await call<SecurityResult>("unlock-app", "wrong one")).ok).toBe(false);
    expect((await state()).locked).toBe(true);
    expect((await call<SecurityResult>("unlock-app", PASSWORD)).ok).toBe(true);
    expect((await state()).locked).toBe(false);
  });
});

describe("turning security controls off", () => {
  beforeEach(async () => {
    await register({ enabled: true });
    await call("unlock-app", PASSWORD);
  });

  it("needs the current password", async () => {
    const missing = await call<SecurityUpdate>("set-security-enabled", false);
    expect(missing.ok).toBe(false);
    const wrong = await call<SecurityUpdate>("set-security-enabled", false, "nope");
    expect(wrong).toMatchObject({ ok: false, error: "That isn't your current password." });
    expect(storeData.get("securityControlsEnabled")).toBe(true);

    const right = await call<SecurityUpdate>("set-security-enabled", false, PASSWORD);
    expect(right.ok).toBe(true);
    expect(right.state.enabled).toBe(false);
  });

  it("switching back on asks for nothing", async () => {
    await call("set-security-enabled", false, PASSWORD);
    const result = await call<SecurityUpdate>("set-security-enabled", true);
    expect(result).toMatchObject({ ok: true, state: { enabled: true, locked: false } });
  });
});

describe("wrong-password throttle", () => {
  beforeEach(() => register({ enabled: true }));

  it("blocks after five wrong passwords and says how long for", async () => {
    for (let i = 0; i < 4; i++) {
      expect(await call<SecurityResult>("unlock-app", "wrong")).toEqual({
        ok: false,
        error: "Wrong password.",
      });
    }
    const fifth = await call<SecurityResult>("unlock-app", "wrong");
    expect(fifth.ok).toBe(false);
    expect(fifth.retryAfterMs).toBeGreaterThan(FIRST_BLOCK_MS - 1000);
    expect(fifth.error).toMatch(/Too many attempts/);
  });

  it("refuses even the right password while the wait runs", async () => {
    for (let i = 0; i < 5; i++) await call("unlock-app", "wrong");
    const result = await call<SecurityResult>("unlock-app", PASSWORD);
    expect(result.ok).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect((await state()).locked).toBe(true);
  });

  it("survives a relaunch, since it's kept in the store", async () => {
    await register({
      enabled: true,
      throttle: { failures: 5, blockedUntil: Date.now() + FIRST_BLOCK_MS },
    });
    expect((await call<SecurityResult>("unlock-app", PASSWORD)).ok).toBe(false);
  });

  it("lets the right password in once the wait is over, and clears the count", async () => {
    await register({ enabled: true, throttle: { failures: 5, blockedUntil: Date.now() - 1 } });
    expect((await call<SecurityResult>("unlock-app", PASSWORD)).ok).toBe(true);
    expect(storeData.get("unlockThrottle")).toEqual({ failures: 0, blockedUntil: null });
  });

  it("checks one attempt at a time", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => call<SecurityResult>("unlock-app", "wrong")),
    );
    // Only one got as far as scrypt; the rest were turned away unchecked.
    expect((storeData.get("unlockThrottle") as { failures: number }).failures).toBe(1);
    expect(results.filter((r) => r.error === "Still checking the last attempt.")).toHaveLength(9);
  });
});
