import { describe, expect, it } from "vitest";
import { needsAttention, phoneStatusLabel } from "../src/lib/phoneStatusLabel";
import type { PhoneStatus } from "../electron/shared/phoneStatus";

const status = (over: Partial<PhoneStatus>): PhoneStatus => ({
  battery: "ok",
  connection: "unknown",
  reachable: true,
  ...over,
});

describe("phoneStatusLabel", () => {
  it("puts an unreachable phone first", () => {
    const label = phoneStatusLabel(status({ reachable: false, battery: "low" }));
    expect(label).toMatchObject({ tone: "error", icon: "unreachable" });
    expect(needsAttention(label)).toBe(true);
  });

  it("warns about a low battery", () => {
    const label = phoneStatusLabel(status({ battery: "low", connection: "mobile" }));
    expect(label).toMatchObject({ tone: "warn", icon: "battery-low" });
    expect(needsAttention(label)).toBe(true);
  });

  it("only informs about the connection", () => {
    expect(phoneStatusLabel(status({ connection: "mobile" }))).toMatchObject({
      tone: "ok",
      text: "Phone on mobile data",
    });
    expect(phoneStatusLabel(status({ connection: "wifi" })).text).toBe("Phone on Wi-Fi");
    const fine = phoneStatusLabel(status({}));
    expect(fine.text).toBe("Phone connected");
    expect(needsAttention(fine)).toBe(false);
  });
});
