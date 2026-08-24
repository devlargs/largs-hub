import type { Service } from "../types";

// The accessible name for a sidebar service button.
//
// The button is icon-only, and its unread badge and disabled state are conveyed
// purely visually — a screen reader user got nothing but the icon's alt text
// (issue #88). Pure so it can be unit-tested.
export function serviceLabel(service: Service, unread: number): string {
  const parts = [service.name];
  if (service.enabled === false) {
    // A disabled service has no live count, so the badge is irrelevant.
    parts.push("disabled");
  } else if (unread > 0) {
    parts.push(`${unread} unread`);
  }
  return parts.join(", ");
}
