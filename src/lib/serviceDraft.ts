import { InternalServiceType, Service, TASKS_URL } from "../types";
import { normalizeServiceUrl } from "./serviceUrl";
import { sortByName } from "./serviceOrder";

// What the Add / Edit service modal submits, kept pure so it can be
// unit-tested: the preset list, and turning the form into a Service.

export interface ServicePreset {
  name: string;
  url: string;
  icon: string;
  type?: InternalServiceType;
}

// Sorted by name, so the grid reads alphabetically however this literal
// happens to be ordered (issue #100). The Custom tile isn't in here — it is
// appended after the presets in the grid itself.
export const POPULAR_SERVICES: ServicePreset[] = sortByName([
  { name: "Gmail", url: "https://mail.google.com", icon: "gmail.png" },
  { name: "Slack", url: "https://app.slack.com", icon: "slack.png" },
  { name: "Discord", url: "https://discord.com/app", icon: "discord.png" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", icon: "whatsapp.png" },
  { name: "Telegram", url: "https://web.telegram.org", icon: "telegram.png" },
  { name: "Notion", url: "https://www.notion.so", icon: "notion.png" },
  { name: "Todo", url: TASKS_URL, icon: "todo.svg" },
  { name: "Twitter / X", url: "https://x.com", icon: "x.png" },
  { name: "Reddit", url: "https://reddit.com", icon: "reddit.png" },
  { name: "LinkedIn", url: "https://linkedin.com", icon: "linkedin.png" },
  { name: "Messenger", url: "https://www.messenger.com", icon: "messenger.png" },
  { name: "Google Chat", url: "https://chat.google.com", icon: "googlechat.svg" },
]);

export function filterPresets(search: string): ServicePreset[] {
  const query = search.toLowerCase();
  return POPULAR_SERVICES.filter((s) => s.name.toLowerCase().includes(query));
}

export const URL_ERROR = "Enter a web address like https://example.com";

const NEW_SERVICE_COLOR = "#06b6d4";

// "edit" changes an existing service, "custom" adds one from the name/URL/icon
// form, "preset" adds the tile picked in the grid.
export type DraftMode = "edit" | "custom" | "preset";

export interface ServiceDraft {
  mode: DraftMode;
  editingService: Service | null;
  name: string;
  url: string;
  icon: string;
  preset: ServicePreset | null;
}

// The service to submit, or why not. A failure without an error has nothing
// to say: the confirm button is disabled in that state anyway.
export type DraftResult = { ok: true; service: Service } | { ok: false; error?: string };

export function canConfirmDraft(draft: Omit<ServiceDraft, "editingService" | "icon">): boolean {
  return draft.mode === "preset"
    ? draft.preset !== null
    : draft.name.trim().length > 0 && draft.url.trim().length > 0;
}

export function resolveDraft(draft: ServiceDraft, newId: () => string): DraftResult {
  const { mode, editingService, icon } = draft;
  const name = draft.name.trim();

  if (mode === "custom") {
    const url = normalizeServiceUrl(draft.url);
    if (!name || !url) return { ok: false, error: URL_ERROR };
    return {
      ok: true,
      service: { id: newId(), name, url, icon, color: NEW_SERVICE_COLOR, notificationCount: 0 },
    };
  }

  if (mode === "edit" && editingService) {
    if (!name || !draft.url.trim()) return { ok: false };
    // Internal services (the retired Note Taker) carry a URL that is never edited
    const url = editingService.type ? editingService.url : normalizeServiceUrl(draft.url);
    // The main process would reject this and hand back the unchanged list,
    // which the renderer can't tell apart from a successful save (#78)
    if (!url) return { ok: false, error: URL_ERROR };
    // Never fall back to the old icon: after Remove it's the built-in icon for
    // the name, or empty.
    return { ok: true, service: { ...editingService, name, url, icon } };
  }

  const { preset } = draft;
  if (!preset) return { ok: false };
  return {
    ok: true,
    service: {
      id: newId(),
      name: preset.name,
      url: preset.url,
      icon: icon || preset.icon,
      color: NEW_SERVICE_COLOR,
      notificationCount: 0,
      ...(preset.type ? { type: preset.type } : {}),
    },
  };
}
