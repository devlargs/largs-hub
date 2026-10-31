import { describe, expect, it } from "vitest";
import {
  PLATFORM_TASK_TYPES,
  automationPlatformFor,
  platformSupports,
} from "../electron/shared/automationPlatform";

describe("automationPlatformFor", () => {
  it("recognises Messenger and WhatsApp hosts", () => {
    expect(automationPlatformFor("https://www.messenger.com/t/123")).toBe("messenger");
    expect(automationPlatformFor("https://web.whatsapp.com")).toBe("whatsapp");
    expect(automationPlatformFor("https://whatsapp.com")).toBe("whatsapp");
  });

  it("rejects lookalike hosts and other services", () => {
    expect(automationPlatformFor("https://evilwhatsapp.com")).toBeNull();
    expect(automationPlatformFor("https://whatsapp.com.example.org")).toBeNull();
    expect(automationPlatformFor("https://mail.google.com/whatsapp")).toBeNull();
    expect(automationPlatformFor("not a url")).toBeNull();
  });
});

describe("platformSupports", () => {
  it("gives WhatsApp the call cycle only", () => {
    expect(PLATFORM_TASK_TYPES.whatsapp).toEqual(["startCallCycle"]);
    expect(platformSupports("whatsapp", "startCallCycle")).toBe(true);
    expect(platformSupports("whatsapp", "sendChatMessage")).toBe(false);
  });

  it("gives Messenger every task", () => {
    expect(platformSupports("messenger", "startCallCycle")).toBe(true);
    expect(platformSupports("messenger", "sendRandomFromList")).toBe(true);
  });
});
