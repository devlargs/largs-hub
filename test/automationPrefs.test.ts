import { describe, expect, it } from "vitest";
import { sanitizeAutomationPrefs, sanitizeStoredPrefs } from "../electron/automationPrefs";
import { DEFAULT_FORM, formFromPrefs, prefsFromForm } from "../src/lib/automationForm";
import type { MessageListGroup } from "../electron/shared/types";

const list: MessageListGroup = {
  id: "l1",
  name: "Greetings",
  messages: ["hi"],
  createdAt: 0,
  updatedAt: 0,
};

describe("sanitizeAutomationPrefs", () => {
  it("keeps well-formed settings", () => {
    const prefs = {
      type: "sendEmoji",
      time: "21:30",
      fromSec: "10",
      toSec: "60",
      emoji: "🔥",
      maxLength: "3",
      ringSeconds: "45",
      listGroupId: "l1",
      autoStopMinutes: "90",
    };
    expect(sanitizeAutomationPrefs(prefs)).toEqual(prefs);
  });

  it("drops malformed fields and keeps the rest", () => {
    expect(
      sanitizeAutomationPrefs({
        type: "deleteEverything",
        time: "25:00",
        fromSec: "-5",
        toSec: "12",
        maxLength: 3,
        emoji: "   ",
        listGroupId: "",
        autoStopMinutes: "1e9",
      }),
    ).toEqual({ toSec: "12" });
  });

  it("never keeps a message", () => {
    expect(sanitizeAutomationPrefs({ message: "secret" })).toEqual({});
  });

  it("copes with junk", () => {
    expect(sanitizeAutomationPrefs(null)).toEqual({});
    expect(sanitizeAutomationPrefs("x")).toEqual({});
  });
});

describe("sanitizeStoredPrefs", () => {
  it("drops entries for services that no longer exist", () => {
    const stored = { a: { toSec: "5" }, gone: { toSec: "9" } };
    expect(sanitizeStoredPrefs(stored, ["a"])).toEqual({ a: { toSec: "5" } });
  });

  it("copes with a missing or malformed store value", () => {
    expect(sanitizeStoredPrefs(undefined, ["a"])).toEqual({});
    expect(sanitizeStoredPrefs([], ["a"])).toEqual({});
  });
});

describe("prefsFromForm / formFromPrefs", () => {
  it("round-trips the form, less the message", () => {
    const form = {
      ...DEFAULT_FORM,
      type: "sendRandomFromList" as const,
      message: "draft",
      fromSec: "7",
      listGroup: list,
    };
    const prefs = prefsFromForm(form, "45");
    expect(prefs).not.toHaveProperty("message");
    expect(prefs).toMatchObject({ listGroupId: "l1", autoStopMinutes: "45" });
    expect(formFromPrefs(prefs, [list])).toEqual({ ...form, message: "" });
  });

  it("falls back to the defaults for anything not saved", () => {
    expect(formFromPrefs({}, [])).toEqual(DEFAULT_FORM);
    expect(formFromPrefs({ toSec: "99" }, [])).toEqual({ ...DEFAULT_FORM, toSec: "99" });
  });

  it("forgets a list that has since been deleted", () => {
    expect(formFromPrefs({ listGroupId: "gone" }, [list]).listGroup).toBeNull();
  });

  it("round-trips through main's check", () => {
    const prefs = prefsFromForm({ ...DEFAULT_FORM, emoji: "❤️", time: "07:05" }, "30");
    expect(sanitizeAutomationPrefs(prefs)).toEqual(prefs);
  });
});
