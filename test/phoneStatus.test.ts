import { describe, expect, it } from "vitest";
import {
  isGoogleMessagesHost,
  parsePhoneStatus,
  phoneStatusEqual,
  type PhoneStatus,
} from "../electron/shared/phoneStatus";

const paired = (...banners: string[]) => ({ paired: true, banners });
// The status for a paired page with these banners (never null when paired).
const read = (...banners: string[]): PhoneStatus => {
  const status = parsePhoneStatus(paired(...banners));
  if (!status) throw new Error("expected a status");
  return status;
};
const OK = { battery: "ok", connection: "unknown", reachable: true };

describe("parsePhoneStatus", () => {
  it("has no status until a phone is paired", () => {
    expect(parsePhoneStatus(null)).toBeNull();
    expect(parsePhoneStatus({ paired: false, banners: ["Phone battery low"] })).toBeNull();
  });

  it("reads a paired phone with no banners as fine", () => {
    expect(parsePhoneStatus(paired())).toEqual(OK);
  });

  it("spots a low battery", () => {
    expect(read("Phone battery low").battery).toBe("low");
    expect(read("Your phone's battery is low").battery).toBe("low");
    expect(read("Low battery on your phone").battery).toBe("low");
  });

  it("lets a restored or charging banner win over a stale low one", () => {
    expect(read("Phone battery low", "Phone battery restored").battery).toBe("ok");
  });

  it("reads the connection type", () => {
    expect(read("Your phone is using mobile data").connection).toBe("mobile");
    expect(read("Connected over Wi-Fi").connection).toBe("wifi");
  });

  it("spots an unreachable phone", () => {
    for (const text of [
      "Trying to reach phone…",
      "Can't connect to your phone",
      "Can’t reach your phone",
      "Phone is offline",
      "Reconnecting",
    ]) {
      expect(read(text).reachable, text).toBe(false);
    }
  });

  it("ignores banners about other things and junk entries", () => {
    const reading = {
      paired: true,
      banners: ["Turn on notifications", 42, null] as unknown as string[],
    };
    expect(parsePhoneStatus(reading)).toEqual(OK);
  });
});

describe("phoneStatusEqual", () => {
  it("compares field by field, null included", () => {
    expect(phoneStatusEqual(null, null)).toBe(true);
    expect(phoneStatusEqual(null, parsePhoneStatus(paired()))).toBe(false);
    expect(phoneStatusEqual(parsePhoneStatus(paired()), parsePhoneStatus(paired()))).toBe(true);
    expect(
      phoneStatusEqual(parsePhoneStatus(paired()), parsePhoneStatus(paired("Phone battery low"))),
    ).toBe(false);
  });
});

describe("isGoogleMessagesHost", () => {
  it("matches only Google Messages", () => {
    expect(isGoogleMessagesHost("messages.google.com")).toBe(true);
    expect(isGoogleMessagesHost("chat.google.com")).toBe(false);
    expect(isGoogleMessagesHost("messages.google.com.evil.test")).toBe(false);
  });
});
