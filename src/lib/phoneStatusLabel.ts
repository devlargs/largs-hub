import type { PhoneStatus } from "@shared/phoneStatus";

// What the sidebar mark and the titlebar chip say about a paired phone. The
// worst problem wins: an unreachable phone can't report its battery.

export type PhoneStatusTone = "ok" | "warn" | "error";
export type PhoneStatusIcon = "unreachable" | "battery-low" | "mobile-data" | "ok";

export interface PhoneStatusLabel {
  tone: PhoneStatusTone;
  icon: PhoneStatusIcon;
  text: string;
}

export function phoneStatusLabel(status: PhoneStatus): PhoneStatusLabel {
  if (!status.reachable) return { tone: "error", icon: "unreachable", text: "Phone not reachable" };
  if (status.battery === "low")
    return { tone: "warn", icon: "battery-low", text: "Phone battery low, charge it" };
  if (status.connection === "mobile")
    return { tone: "ok", icon: "mobile-data", text: "Phone on mobile data" };
  if (status.connection === "wifi") return { tone: "ok", icon: "ok", text: "Phone on Wi-Fi" };
  return { tone: "ok", icon: "ok", text: "Phone connected" };
}

/** Whether the sidebar should mark the service's icon. */
export function needsAttention(label: PhoneStatusLabel): boolean {
  return label.tone !== "ok";
}
