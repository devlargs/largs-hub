import { describe, expect, it } from "vitest";
import {
  buildPasscodeOfferScript,
  offerMenuPosition,
  parseLoginFieldFocus,
  passcodesToOffer,
} from "../electron/serviceViews/passcodeOfferScript";
import type { Passcode } from "../electron/shared/types";

const TOKEN = "__largs_passcode_abc__";

const passcode = (label: string, serviceId: string | null, username = ""): Passcode => ({
  id: label,
  label,
  username,
  serviceId,
  createdAt: 0,
  updatedAt: 0,
});

describe("buildPasscodeOfferScript", () => {
  it("parses and carries the token as a string literal", () => {
    const code = buildPasscodeOfferScript(TOKEN);
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain(JSON.stringify(TOKEN));
  });

  it("escapes a token that would break out of the string", () => {
    const code = buildPasscodeOfferScript('a"; alert(1); "');
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain('"a\\"; alert(1); \\""');
  });
});

describe("parseLoginFieldFocus", () => {
  const line = (data: unknown) => TOKEN + JSON.stringify(data);

  it("reads a password or username field", () => {
    expect(parseLoginFieldFocus(line({ kind: "password", x: 10, y: 40 }), TOKEN)).toEqual({
      kind: "password",
      x: 10,
      y: 40,
    });
    expect(parseLoginFieldFocus(line({ kind: "username", x: 0, y: 5.5 }), TOKEN)?.kind).toBe(
      "username",
    );
  });

  it("ignores other console lines and a wrong or empty token", () => {
    expect(parseLoginFieldFocus("hello", TOKEN)).toBeNull();
    expect(parseLoginFieldFocus(line({ kind: "password", x: 1, y: 1 }), "other")).toBeNull();
    expect(parseLoginFieldFocus(JSON.stringify({ kind: "password", x: 1, y: 1 }), "")).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(parseLoginFieldFocus(TOKEN + "{", TOKEN)).toBeNull();
    expect(parseLoginFieldFocus(line(null), TOKEN)).toBeNull();
    expect(parseLoginFieldFocus(line({ kind: "search", x: 1, y: 1 }), TOKEN)).toBeNull();
    expect(parseLoginFieldFocus(line({ kind: "password", x: "1", y: 1 }), TOKEN)).toBeNull();
    expect(parseLoginFieldFocus(line({ kind: "password", x: 1, y: 1e9 }), TOKEN)).toBeNull();
  });
});

describe("passcodesToOffer", () => {
  const list = [
    passcode("zeta", "svc-a"),
    passcode("Alpha", "svc-a", "me@example.com"),
    passcode("global", null, "g@example.com"),
    passcode("other", "svc-b"),
  ];

  it("offers only this service's passcodes, by name", () => {
    expect(passcodesToOffer(list, "svc-a", "password").map((p) => p.label)).toEqual([
      "Alpha",
      "zeta",
    ]);
  });

  it("offers only entries with a username in a username field", () => {
    expect(passcodesToOffer(list, "svc-a", "username").map((p) => p.label)).toEqual(["Alpha"]);
  });

  it("offers nothing for a service with no passcodes of its own", () => {
    expect(passcodesToOffer(list, "svc-c", "password")).toEqual([]);
  });
});

describe("offerMenuPosition", () => {
  const bounds = { x: 72, y: 40, width: 800, height: 600 };

  it("places the menu just under the field, in window coordinates", () => {
    expect(offerMenuPosition({ kind: "password", x: 100, y: 200 }, bounds, 1)).toEqual({
      x: 172,
      y: 242,
    });
  });

  it("applies the service's zoom", () => {
    expect(offerMenuPosition({ kind: "password", x: 100, y: 200 }, bounds, 1.5)).toEqual({
      x: 222,
      y: 342,
    });
  });

  it("keeps the menu inside the view and ignores a bad zoom", () => {
    expect(offerMenuPosition({ kind: "password", x: -50, y: 5000 }, bounds, NaN)).toEqual({
      x: 72,
      y: 640,
    });
  });
});
