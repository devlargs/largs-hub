import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCloudPasscodes } from "../electron/passcodes/cloudPasscodes";
import {
  open,
  parseKey,
  sanitizeKeyring,
  sanitizeVault,
  seal,
} from "../electron/passcodes/cloudCrypto";
import type { CloudPasscodeKeyring } from "../electron/shared/types";

const keyring = (tag = "a"): CloudPasscodeKeyring => ({
  v: 1,
  salt: btoa(`salt-${tag}`),
  iterations: 600_000,
  iv: btoa(`iv-${tag}`),
  wrappedKey: btoa(`wrapped-${tag}`),
});

let ids = 0;
function setup() {
  let changes = 0;
  const cloud = createCloudPasscodes({
    onChange: () => changes++,
    newId: () => `id-${++ids}`,
    now: () => 1000,
  });
  return { cloud, changes: () => changes };
}

const draft = (label: string, secret = "1234") => ({
  label,
  username: "",
  serviceId: null,
  secret,
});

describe("cloudCrypto", () => {
  it("seals and opens, and refuses the wrong key or altered data", () => {
    const key = randomBytes(32);
    const sealed = seal(key, "hello");
    expect(open(key, sealed)).toBe("hello");
    expect(open(randomBytes(32), sealed)).toBeNull();
    const bytes = Buffer.from(sealed, "base64");
    bytes[14] ^= 1;
    expect(open(key, bytes.toString("base64"))).toBeNull();
    expect(open(key, "AAAA")).toBeNull();
  });

  it("uses a fresh nonce each time", () => {
    const key = randomBytes(32);
    expect(seal(key, "same")).not.toBe(seal(key, "same"));
  });

  it("only takes a 32-byte base64 key", () => {
    expect(parseKey(randomBytes(32).toString("base64"))).not.toBeNull();
    expect(parseKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseKey("not base64!")).toBeNull();
    expect(parseKey(42)).toBeNull();
  });

  it("checks keyrings and vaults from the account", () => {
    expect(sanitizeKeyring(keyring())).toEqual(keyring());
    expect(sanitizeKeyring({ ...keyring(), iterations: 10 })).toBeNull();
    expect(sanitizeKeyring({ ...keyring(), iterations: 1e9 })).toBeNull();
    expect(sanitizeKeyring({ ...keyring(), v: 2 })).toBeNull();
    expect(sanitizeKeyring({ ...keyring(), salt: "<script>" })).toBeNull();
    expect(sanitizeVault({ keyring: keyring(), data: "QUJD" })).toEqual({
      keyring: keyring(),
      data: "QUJD",
    });
    expect(sanitizeVault({ keyring: keyring(), data: "" })).toBeNull();
    expect(sanitizeVault({ keyring: keyring(), data: "A".repeat(800_000) })).toBeNull();
    expect(sanitizeVault(null)).toBeNull();
  });
});

describe("createCloudPasscodes", () => {
  it("waits for the account's copy before anything can be used", () => {
    const { cloud } = setup();
    expect(cloud.state()).toBe("waiting");
    cloud.setKey(randomBytes(32), keyring());
    expect(cloud.state()).toBe("waiting");
    expect(cloud.exportVault()).toBeNull();
  });

  it("starts an empty list for an account with no passcodes yet", () => {
    const { cloud } = setup();
    const key = randomBytes(32);
    cloud.setKey(key, keyring());
    cloud.seed(null);
    expect(cloud.state()).toBe("ready");
    expect(cloud.vault.save(draft("Bank"), []).ok).toBe(true);
    expect(cloud.vault.reveal(cloud.vault.list()[0].id)).toBe("1234");
  });

  it("needs the password when there's no key", () => {
    const { cloud } = setup();
    cloud.seed(null);
    expect(cloud.state()).toBe("needs-password");
    expect(cloud.vault.save(draft("Bank"), []).ok).toBe(false);
  });

  it("round-trips through the account to another computer with the same key", () => {
    const key = randomBytes(32);
    const a = setup();
    a.cloud.setKey(key, keyring());
    a.cloud.seed(null);
    a.cloud.vault.save(draft("Bank", "9876"), []);
    expect(a.changes()).toBe(1);
    const exported = a.cloud.exportVault()!;
    expect(exported.keyring).toEqual(keyring());
    expect(JSON.stringify(exported)).not.toContain("9876");
    expect(JSON.stringify(exported)).not.toContain("Bank");

    const b = setup();
    b.cloud.seed(exported);
    expect(b.cloud.state()).toBe("needs-password");
    expect(b.cloud.exportVault()).toEqual(exported); // untouched while locked
    expect(b.cloud.setKey(randomBytes(32), keyring())).toBe(false);
    expect(b.cloud.setKey(key, keyring())).toBe(true);
    const [entry] = b.cloud.vault.list();
    expect(entry.label).toBe("Bank");
    expect(b.cloud.vault.reveal(entry.id)).toBe("9876");
    // Unchanged, it exports the same bytes, so the fingerprint doesn't move
    expect(b.cloud.exportVault()).toEqual(exported);
  });

  it("locks again when the account's copy was re-keyed elsewhere", () => {
    const { cloud } = setup();
    cloud.setKey(randomBytes(32), keyring());
    cloud.seed(null);
    cloud.seed({ keyring: keyring("b"), data: seal(randomBytes(32), "[]") });
    expect(cloud.state()).toBe("needs-password");
    expect(cloud.hasKey()).toBe(false);
  });

  it("starts over under a new key, dropping a copy no key opens", () => {
    const { cloud } = setup();
    cloud.seed({ keyring: keyring("old"), data: seal(randomBytes(32), "[]") });
    const key = randomBytes(32);
    expect(cloud.setKey(key, keyring("new"))).toBe(false);
    expect(cloud.setKey(key, keyring("new"), true)).toBe(true);
    expect(cloud.state()).toBe("ready");
    expect(cloud.vault.list()).toEqual([]);
    expect(cloud.exportVault()?.keyring).toEqual(keyring("new"));
  });

  it("keeps passcodes moved in from this computer when the same copy comes back", () => {
    const key = randomBytes(32);
    const account = { keyring: keyring(), data: seal(key, "[]") };
    const { cloud } = setup();
    cloud.setKey(key, keyring());
    cloud.seed(account);
    cloud.importLocal([
      {
        id: "local-1",
        label: "Phone PIN",
        username: "",
        serviceId: null,
        createdAt: 1,
        updatedAt: 1,
        secret: "enc:ignored",
        plain: "4321",
      },
    ]);
    // The first sync applies the very copy it seeded with
    cloud.seed(account);
    expect(cloud.vault.list().map((p) => p.id)).toEqual(["local-1"]);
    expect(cloud.vault.reveal("local-1")).toBe("4321");
  });

  it("takes a newer copy from another computer", () => {
    const key = randomBytes(32);
    const a = setup();
    a.cloud.setKey(key, keyring());
    a.cloud.seed(null);
    const b = setup();
    b.cloud.setKey(key, keyring());
    b.cloud.seed(null);
    b.cloud.vault.save(draft("Mail"), []);
    a.cloud.seed(b.cloud.exportVault());
    expect(a.cloud.vault.list().map((p) => p.label)).toEqual(["Mail"]);
  });

  it("forgets everything on sign-out", () => {
    const { cloud } = setup();
    cloud.setKey(randomBytes(32), keyring());
    cloud.seed(null);
    cloud.vault.save(draft("Bank"), []);
    cloud.clear();
    expect(cloud.state()).toBe("waiting");
    expect(cloud.hasKey()).toBe(false);
    expect(cloud.vault.list()).toEqual([]);
  });
});
