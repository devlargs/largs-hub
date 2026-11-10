import { describe, expect, it } from "vitest";
import {
  MAX_PASSCODES,
  PasscodeCrypto,
  StoredPasscode,
  checkDraft,
  createPasscodeVault,
  passcodesForService,
  sanitizeStoredPasscodes,
  typingSteps,
} from "../electron/passcodes/vault";

// A stand-in for safeStorage: "encrypts" by reversing, so the stored value is
// visibly not the passcode.
const reversing: PasscodeCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from([...value].reverse().join("")),
  decryptString: (buffer) => [...buffer.toString()].reverse().join(""),
};

function setup(crypto: PasscodeCrypto = reversing, initial: unknown = []) {
  let stored: unknown = initial;
  let nextId = 0;
  let time = 1000;
  const vault = createPasscodeVault({
    read: () => stored,
    write: (value) => {
      stored = value;
    },
    crypto,
    now: () => time,
    newId: () => `id-${++nextId}`,
  });
  return {
    vault,
    stored: () => stored as StoredPasscode[],
    tick: () => (time += 1000),
  };
}

const SERVICES = ["svc-a", "svc-b"];

describe("createPasscodeVault", () => {
  it("saves a passcode encrypted and lists it without the secret", () => {
    const { vault, stored } = setup();
    const saved = vault.save(
      { label: " Messenger PIN ", username: "", serviceId: "svc-a", secret: "123456" },
      SERVICES,
    );
    expect(saved).toMatchObject({ ok: true, passcode: { id: "id-1", label: "Messenger PIN" } });
    expect(stored()[0].secret).toMatch(/^enc:/);
    expect(JSON.stringify(stored())).not.toContain("123456");
    expect(vault.list()).toEqual([
      {
        id: "id-1",
        label: "Messenger PIN",
        username: "",
        serviceId: "svc-a",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);
    expect(JSON.stringify(vault.list())).not.toContain("enc:");
    expect(vault.reveal("id-1")).toBe("123456");
  });

  it("keeps the saved passcode when an edit leaves it blank", () => {
    const { vault, tick } = setup();
    vault.save({ label: "Bank", username: "me", serviceId: null, secret: "s3cret" }, SERVICES);
    tick();
    const edited = vault.save(
      { id: "id-1", label: "Bank login", username: "me@x", serviceId: "svc-b" },
      SERVICES,
    );
    expect(edited).toMatchObject({
      ok: true,
      passcode: { label: "Bank login", username: "me@x", createdAt: 1000, updatedAt: 2000 },
    });
    expect(vault.reveal("id-1")).toBe("s3cret");
    expect(vault.list()).toHaveLength(1);
  });

  it("replaces the passcode when an edit gives a new one", () => {
    const { vault } = setup();
    vault.save({ label: "Bank", username: "", serviceId: null, secret: "old" }, SERVICES);
    vault.save(
      { id: "id-1", label: "Bank", username: "", serviceId: null, secret: "new" },
      SERVICES,
    );
    expect(vault.reveal("id-1")).toBe("new");
  });

  it("refuses to store a passcode it can't encrypt", () => {
    const { vault, stored } = setup({ ...reversing, isEncryptionAvailable: () => false });
    const saved = vault.save({ label: "X", username: "", serviceId: null, secret: "1" }, SERVICES);
    expect(saved.ok).toBe(false);
    expect(stored()).toEqual([]);
    expect(vault.available()).toBe(false);
  });

  it("refuses an edit to a passcode that no longer exists", () => {
    const { vault } = setup();
    expect(vault.save({ id: "gone", label: "X", username: "", serviceId: null }, SERVICES)).toEqual(
      { ok: false, error: "That passcode no longer exists." },
    );
  });

  it("caps how many can be saved", () => {
    const full = Array.from({ length: MAX_PASSCODES }, (_, i) => ({
      id: `p${i}`,
      label: `P${i}`,
      username: "",
      serviceId: null,
      createdAt: 0,
      updatedAt: 0,
      secret: "enc:AA==",
    }));
    const { vault } = setup(reversing, full);
    expect(
      vault.save({ label: "One more", username: "", serviceId: null, secret: "1" }, SERVICES).ok,
    ).toBe(false);
  });

  it("returns null for a passcode that won't decrypt here", () => {
    const failing: PasscodeCrypto = {
      ...reversing,
      decryptString: () => {
        throw new Error("wrong key");
      },
    };
    const { vault } = setup(failing);
    vault.save({ label: "X", username: "", serviceId: null, secret: "1" }, SERVICES);
    expect(vault.reveal("id-1")).toBeNull();
    expect(vault.reveal("missing")).toBeNull();
  });

  it("removes a passcode", () => {
    const { vault } = setup();
    vault.save({ label: "X", username: "", serviceId: null, secret: "1" }, SERVICES);
    expect(vault.remove("id-1")).toBe(true);
    expect(vault.remove("id-1")).toBe(false);
    expect(vault.list()).toEqual([]);
  });

  it("moves a removed service's passcodes to every service", () => {
    const { vault } = setup();
    vault.save({ label: "A", username: "", serviceId: "svc-a", secret: "1" }, SERVICES);
    vault.save({ label: "B", username: "", serviceId: "svc-b", secret: "2" }, SERVICES);
    vault.unlinkService("svc-a");
    expect(vault.list().map((p) => [p.label, p.serviceId])).toEqual([
      ["A", null],
      ["B", "svc-b"],
    ]);
    expect(vault.reveal("id-1")).toBe("1");
  });
});

describe("checkDraft", () => {
  it("needs a name and, for a new entry, a passcode", () => {
    expect(checkDraft({ label: "  ", secret: "1" }, SERVICES)).toMatchObject({ ok: false });
    expect(checkDraft({ label: "X" }, SERVICES)).toEqual({
      ok: false,
      error: "Enter the passcode.",
    });
    expect(checkDraft(null, SERVICES)).toMatchObject({ ok: false });
  });

  it("refuses a service that doesn't exist", () => {
    expect(checkDraft({ label: "X", secret: "1", serviceId: "nope" }, SERVICES)).toEqual({
      ok: false,
      error: "That service no longer exists.",
    });
  });

  it("keeps the passcode exactly as typed", () => {
    expect(checkDraft({ label: "X", secret: " a b " }, SERVICES)).toMatchObject({
      ok: true,
      secret: " a b ",
      serviceId: null,
    });
  });

  it("refuses an over-long passcode", () => {
    expect(checkDraft({ label: "X", secret: "a".repeat(1001) }, SERVICES).ok).toBe(false);
  });
});

describe("sanitizeStoredPasscodes", () => {
  it("drops malformed, unencrypted and duplicate entries", () => {
    const good = {
      id: "a",
      label: "A",
      username: "u",
      serviceId: "svc-a",
      createdAt: 1,
      updatedAt: 2,
      secret: "enc:AA==",
    };
    expect(
      sanitizeStoredPasscodes([
        good,
        { ...good },
        { ...good, id: "b", secret: "plain" },
        { ...good, id: "c", label: "" },
        null,
        "x",
      ]),
    ).toEqual([good]);
    expect(sanitizeStoredPasscodes("nope")).toEqual([]);
  });
});

describe("passcodesForService", () => {
  it("offers the service's own passcodes first, then the ones for every service", () => {
    const p = (id: string, label: string, serviceId: string | null) => ({
      id,
      label,
      username: "",
      serviceId,
      createdAt: 0,
      updatedAt: 0,
    });
    const list = [
      p("1", "zeta", null),
      p("2", "Beta", "svc-a"),
      p("3", "alpha", null),
      p("4", "Other", "svc-b"),
      p("5", "apple", "svc-a"),
    ];
    expect(passcodesForService(list, "svc-a").map((x) => x.id)).toEqual(["5", "2", "3", "1"]);
  });
});

describe("typingSteps", () => {
  it("types each character as a key press", () => {
    expect(typingSteps("12a")).toEqual([
      { kind: "char", value: "1" },
      { kind: "char", value: "2" },
      { kind: "char", value: "a" },
    ]);
  });

  it("inserts characters a single key event can't carry", () => {
    expect(typingSteps("a😀")).toEqual([
      { kind: "char", value: "a" },
      { kind: "insert", value: "😀" },
    ]);
  });
});
