import { describe, expect, it } from "vitest";
import {
  POPULAR_SERVICES,
  ServiceDraft,
  URL_ERROR,
  canConfirmDraft,
  filterPresets,
  resolveDraft,
} from "../src/lib/serviceDraft";
import type { Service } from "../electron/shared/types";

const newId = () => "new-id";

const existing: Service = {
  id: "s1",
  name: "Old",
  url: "https://old.example.com",
  icon: "custom:old.png",
  color: "#123456",
  notificationCount: 3,
  muted: true,
};

const draft = (overrides: Partial<ServiceDraft>): ServiceDraft => ({
  mode: "custom",
  editingService: null,
  name: "",
  url: "",
  icon: "",
  preset: null,
  ...overrides,
});

describe("presets", () => {
  it("lists the presets alphabetically", () => {
    const names = POPULAR_SERVICES.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("filters by name, ignoring case", () => {
    expect(filterPresets("GOO").map((p) => p.name)).toEqual(["Google Chat"]);
    expect(filterPresets("")).toHaveLength(POPULAR_SERVICES.length);
    expect(filterPresets("nothing like this")).toEqual([]);
  });
});

describe("resolveDraft: custom", () => {
  it("adds a service with a normalised URL and trimmed name", () => {
    const result = resolveDraft(
      draft({ name: "  Jira ", url: "example.atlassian.net", icon: "custom:a.png" }),
      newId,
    );
    expect(result).toEqual({
      ok: true,
      service: {
        id: "new-id",
        name: "Jira",
        url: "https://example.atlassian.net/",
        icon: "custom:a.png",
        color: "#06b6d4",
        notificationCount: 0,
      },
    });
  });

  it("explains a missing name or a bad address", () => {
    expect(resolveDraft(draft({ name: " ", url: "example.com" }), newId)).toEqual({
      ok: false,
      error: URL_ERROR,
    });
    expect(resolveDraft(draft({ name: "X", url: "not a url" }), newId)).toEqual({
      ok: false,
      error: URL_ERROR,
    });
  });
});

describe("resolveDraft: edit", () => {
  const edit = (overrides: Partial<ServiceDraft>) =>
    draft({ mode: "edit", editingService: existing, ...overrides });

  it("keeps everything but the name, URL and icon", () => {
    const result = resolveDraft(edit({ name: "New", url: "new.example.com", icon: "" }), newId);
    expect(result).toEqual({
      ok: true,
      service: { ...existing, name: "New", url: "https://new.example.com/", icon: "" },
    });
  });

  it("does nothing, quietly, with an empty field", () => {
    expect(resolveDraft(edit({ name: "", url: "x.com" }), newId)).toEqual({ ok: false });
    expect(resolveDraft(edit({ name: "A", url: "  " }), newId)).toEqual({ ok: false });
  });

  it("rejects an address main would refuse", () => {
    expect(resolveDraft(edit({ name: "A", url: "not a url" }), newId)).toEqual({
      ok: false,
      error: URL_ERROR,
    });
  });

  it("never changes an internal service's URL", () => {
    const internal: Service = { ...existing, type: "notion-notes", url: "internal://notes" };
    const result = resolveDraft(
      edit({ editingService: internal, name: "Notes", url: "whatever" }),
      newId,
    );
    expect(result.ok && result.service.url).toBe("internal://notes");
  });
});

describe("resolveDraft: preset", () => {
  const gmail = POPULAR_SERVICES.find((p) => p.name === "Gmail")!;

  it("adds the preset with its own icon", () => {
    expect(resolveDraft(draft({ mode: "preset", preset: gmail }), newId)).toEqual({
      ok: true,
      service: {
        id: "new-id",
        name: "Gmail",
        url: gmail.url,
        icon: "gmail.png",
        color: "#06b6d4",
        notificationCount: 0,
      },
    });
  });

  it("needs a picked preset", () => {
    expect(resolveDraft(draft({ mode: "preset" }), newId)).toEqual({ ok: false });
  });
});

describe("canConfirmDraft", () => {
  it("needs a preset in the grid, and a name and URL in the form", () => {
    expect(canConfirmDraft({ mode: "preset", name: "", url: "", preset: null })).toBe(false);
    expect(
      canConfirmDraft({ mode: "preset", name: "", url: "", preset: POPULAR_SERVICES[0] }),
    ).toBe(true);
    expect(canConfirmDraft({ mode: "custom", name: "A", url: " ", preset: null })).toBe(false);
    expect(canConfirmDraft({ mode: "edit", name: "A", url: "a.com", preset: null })).toBe(true);
  });
});
