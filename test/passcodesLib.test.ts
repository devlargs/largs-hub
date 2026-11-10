import { describe, expect, it } from "vitest";
import {
  ALL_SERVICES_LABEL,
  buildPasscodeDraft,
  passcodeServiceName,
  sortPasscodes,
} from "../src/lib/passcodes";
import type { Passcode, Service } from "../src/types";

const passcode = (label: string, serviceId: string | null = null): Passcode => ({
  id: label,
  label,
  username: "",
  serviceId,
  createdAt: 0,
  updatedAt: 0,
});

const services = [{ id: "svc-a", name: "Messenger" }] as Service[];

describe("passcodeServiceName", () => {
  it("names the service, or every service", () => {
    expect(passcodeServiceName(passcode("A", "svc-a"), services)).toBe("Messenger");
    expect(passcodeServiceName(passcode("A"), services)).toBe(ALL_SERVICES_LABEL);
    expect(passcodeServiceName(passcode("A", "gone"), services)).toBe(ALL_SERVICES_LABEL);
  });
});

describe("sortPasscodes", () => {
  it("sorts by name, ignoring case", () => {
    expect(
      sortPasscodes([passcode("b"), passcode("C"), passcode("a")]).map((p) => p.label),
    ).toEqual(["a", "b", "C"]);
  });
});

describe("buildPasscodeDraft", () => {
  it("leaves the passcode out when nothing was typed, so an edit keeps it", () => {
    expect(
      buildPasscodeDraft({ id: "x", label: " Bank ", username: " me ", serviceId: "", secret: "" }),
    ).toEqual({ id: "x", label: "Bank", username: "me", serviceId: null });
  });

  it("sends a new passcode as typed", () => {
    expect(
      buildPasscodeDraft({ label: "PIN", username: "", serviceId: "svc-a", secret: " 12 " }),
    ).toEqual({ label: "PIN", username: "", serviceId: "svc-a", secret: " 12 " });
  });
});
