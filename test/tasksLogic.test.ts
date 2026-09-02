import { describe, expect, it } from "vitest";
import {
  Task,
  bucketByDate,
  carryOverPending,
  clearDirty,
  dateKey,
  emptyPending,
  isDateKey,
  markDeleted,
  markDirty,
  mergeRemoteTasks,
  nextOrder,
  normalizeDatabaseId,
  notionDatabaseUrl,
  reorderTasks,
  sanitizeTaskText,
  shiftDateKey,
  sortTasks,
  tasksForDate,
} from "../electron/tasksLogic";

const NOW = "2026-08-24T10:00:00.000Z";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    text: "a task",
    done: false,
    date: "2026-08-24",
    order: 0,
    editedAt: "2026-08-24T09:00:00.000Z",
    ...overrides,
  };
}

describe("dates", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    // Local-time construction, so this holds in any timezone
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDateKey("2026-08-24", -1)).toBe("2026-08-23");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("recognises well-formed day keys", () => {
    expect(isDateKey("2026-08-24")).toBe(true);
    expect(isDateKey("2026-8-24")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe("ordering and bucketing", () => {
  const tasks = [
    task({ id: "c", order: 2 }),
    task({ id: "a", order: 0 }),
    task({ id: "b", order: 1, date: "2026-08-25" }),
  ];

  it("sorts by manual order, oldest edit breaking ties", () => {
    const tied = [
      task({ id: "late", order: 0, editedAt: "2026-08-24T09:30:00.000Z" }),
      task({ id: "early", order: 0, editedAt: "2026-08-24T09:00:00.000Z" }),
    ];
    expect(sortTasks(tied).map((t) => t.id)).toEqual(["early", "late"]);
  });

  it("filters and buckets by day", () => {
    expect(tasksForDate(tasks, "2026-08-24").map((t) => t.id)).toEqual(["a", "c"]);
    expect(Object.keys(bucketByDate(tasks)).sort()).toEqual(["2026-08-24", "2026-08-25"]);
  });

  it("puts a new task after the day's last one", () => {
    expect(nextOrder(tasks, "2026-08-24")).toBe(3);
    expect(nextOrder(tasks, "2026-09-01")).toBe(0);
  });
});

describe("reorderTasks", () => {
  const tasks = [
    task({ id: "a", order: 0 }),
    task({ id: "b", order: 1 }),
    task({ id: "c", order: 2 }),
  ];

  it("renumbers to the given order and reports what changed", () => {
    const { tasks: next, changed } = reorderTasks(tasks, "2026-08-24", ["c", "a", "b"], NOW);
    expect(tasksForDate(next, "2026-08-24").map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(changed.sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps ids the caller left out instead of dropping them", () => {
    const { tasks: next } = reorderTasks(tasks, "2026-08-24", ["c"], NOW);
    expect(tasksForDate(next, "2026-08-24").map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("leaves other days alone", () => {
    const withOther = [...tasks, task({ id: "x", date: "2026-08-25", order: 7 })];
    const { tasks: next } = reorderTasks(withOther, "2026-08-24", ["b", "a", "c"], NOW);
    expect(next.find((t) => t.id === "x")?.order).toBe(7);
  });
});

describe("carryOverPending", () => {
  const tasks = [
    task({ id: "done", date: "2026-08-23", order: 0, done: true }),
    task({ id: "open1", date: "2026-08-23", order: 1 }),
    task({ id: "open2", date: "2026-08-23", order: 2 }),
    task({ id: "today", date: "2026-08-24", order: 0 }),
  ];

  it("moves only unfinished tasks onto the target day, appended", () => {
    const { tasks: next, moved } = carryOverPending(tasks, "2026-08-24", NOW);
    expect(moved).toEqual(["open1", "open2"]);
    expect(tasksForDate(next, "2026-08-24").map((t) => t.id)).toEqual(["today", "open1", "open2"]);
    // The completed task stays on the day it was completed
    expect(tasksForDate(next, "2026-08-23").map((t) => t.id)).toEqual(["done"]);
  });

  it("sweeps every earlier day, oldest first — not just yesterday", () => {
    const backlog = [
      task({ id: "old", date: "2026-08-01", order: 5 }),
      task({ id: "older", date: "2026-07-30", order: 0 }),
      ...tasks,
    ];
    const { tasks: next, moved } = carryOverPending(backlog, "2026-08-24", NOW);
    expect(moved).toEqual(["older", "old", "open1", "open2"]);
    expect(tasksForDate(next, "2026-08-24").map((t) => t.id)).toEqual([
      "today",
      "older",
      "old",
      "open1",
      "open2",
    ]);
  });

  it("stamps the move so it queues for Notion like any other edit", () => {
    const { tasks: next } = carryOverPending(tasks, "2026-08-24", NOW);
    expect(next.find((t) => t.id === "open1")?.editedAt).toBe(NOW);
  });

  it("leaves the target day and anything after it alone", () => {
    const withFuture = [...tasks, task({ id: "later", date: "2026-08-25", order: 0 })];
    const { moved } = carryOverPending(withFuture, "2026-08-24", NOW);
    expect(moved).not.toContain("later");
    expect(moved).not.toContain("today");
  });

  it("is a no-op when nothing earlier is open", () => {
    const onlyDone = [task({ id: "done", date: "2026-08-23", done: true })];
    const { tasks: next, moved } = carryOverPending(onlyDone, "2026-08-24", NOW);
    expect(moved).toEqual([]);
    expect(next).toBe(onlyDone);
  });

  it("is idempotent — a second sweep finds nothing left behind", () => {
    const { tasks: once } = carryOverPending(tasks, "2026-08-24", NOW);
    expect(carryOverPending(once, "2026-08-24", NOW).moved).toEqual([]);
  });
});

describe("sync queue", () => {
  it("collapses repeated edits to the same task", () => {
    let pending = emptyPending();
    pending = markDirty(pending, ["a"]);
    pending = markDirty(pending, ["a", "b"]);
    expect(pending.dirty.sort()).toEqual(["a", "b"]);
  });

  it("queues the page id when a synced task is deleted", () => {
    const pending = markDeleted(markDirty(emptyPending(), ["a"]), task({ id: "a", pageId: "p1" }));
    expect(pending.dirty).toEqual([]);
    expect(pending.deleted).toEqual(["p1"]);
  });

  it("sends nothing when a task deleted before its first push is removed", () => {
    const pending = markDeleted(markDirty(emptyPending(), ["a"]), task({ id: "a" }));
    expect(pending.dirty).toEqual([]);
    expect(pending.deleted).toEqual([]);
  });

  it("clears an entry once it has been pushed", () => {
    expect(clearDirty(markDirty(emptyPending(), ["a", "b"]), "a").dirty).toEqual(["b"]);
  });
});

describe("mergeRemoteTasks", () => {
  const date = "2026-08-24";
  const newId = (pageId: string) => `local-${pageId}`;

  it("adds tasks that only exist in Notion", () => {
    const merged = mergeRemoteTasks(
      [],
      [{ pageId: "p1", text: "from notion", done: true, date, order: 3, editedAt: NOW }],
      date,
      emptyPending(),
      newId,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "local-p1", text: "from notion", done: true, order: 3 });
  });

  it("takes the newer remote copy", () => {
    const local = [
      task({ id: "a", pageId: "p1", text: "old", editedAt: "2026-08-24T08:00:00.000Z" }),
    ];
    const merged = mergeRemoteTasks(
      local,
      [{ pageId: "p1", text: "new", done: false, date, order: 0, editedAt: NOW }],
      date,
      emptyPending(),
      newId,
    );
    expect(merged[0].text).toBe("new");
  });

  it("keeps a local task that still has an unpushed edit", () => {
    const local = [
      task({ id: "a", pageId: "p1", text: "mine", editedAt: "2026-08-24T08:00:00.000Z" }),
    ];
    const merged = mergeRemoteTasks(
      local,
      [{ pageId: "p1", text: "theirs", done: false, date, order: 0, editedAt: NOW }],
      date,
      markDirty(emptyPending(), ["a"]),
      newId,
    );
    expect(merged[0].text).toBe("mine");
  });

  it("drops a task deleted in Notion, but not one that was never pushed", () => {
    const local = [task({ id: "a", pageId: "p1" }), task({ id: "b" })];
    const merged = mergeRemoteTasks(local, [], date, emptyPending(), newId);
    expect(merged.map((t) => t.id)).toEqual(["b"]);
  });

  it("says nothing about other days", () => {
    const local = [task({ id: "other", date: "2026-08-25", pageId: "p9" })];
    const merged = mergeRemoteTasks(local, [], date, emptyPending(), newId);
    expect(merged.map((t) => t.id)).toEqual(["other"]);
  });
});

describe("sanitizeTaskText", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeTaskText("  write   the\ntests ")).toBe("write the tests");
  });

  it("rejects empty, oversized, and non-string values", () => {
    expect(sanitizeTaskText("   ")).toBeNull();
    expect(sanitizeTaskText("a".repeat(501))).toBeNull();
    expect(sanitizeTaskText(42)).toBeNull();
  });
});

describe("normalizeDatabaseId", () => {
  it("accepts a bare 32-char id", () => {
    expect(normalizeDatabaseId("0123456789abcdef0123456789abcdef")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
  });

  it("extracts the id from a full Notion URL", () => {
    expect(
      normalizeDatabaseId("https://www.notion.so/me/0123456789abcdef0123456789abcdef?v=abc"),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  it("prefers a dashed uuid when present", () => {
    expect(normalizeDatabaseId("01234567-89ab-cdef-0123-456789abcdef")).toBe(
      "01234567-89ab-cdef-0123-456789abcdef",
    );
  });

  it("rejects anything that isn't an id", () => {
    expect(normalizeDatabaseId("not a database")).toBeNull();
  });
});

describe("notionDatabaseUrl", () => {
  it("builds the database's page URL from a bare id", () => {
    expect(notionDatabaseUrl("0123456789abcdef0123456789abcdef")).toBe(
      "https://www.notion.so/0123456789abcdef0123456789abcdef",
    );
  });

  it("strips the dashes a stored uuid may carry", () => {
    expect(notionDatabaseUrl("01234567-89ab-cdef-0123-456789abcdef")).toBe(
      "https://www.notion.so/0123456789abcdef0123456789abcdef",
    );
  });

  it("lowercases, so the same database always gives the same link", () => {
    expect(notionDatabaseUrl("0123456789ABCDEF0123456789ABCDEF")).toBe(
      "https://www.notion.so/0123456789abcdef0123456789abcdef",
    );
  });

  it("has nothing to open without a usable id", () => {
    expect(notionDatabaseUrl("")).toBeNull();
    expect(notionDatabaseUrl("not a database")).toBeNull();
    expect(notionDatabaseUrl(null)).toBeNull();
    expect(notionDatabaseUrl(undefined)).toBeNull();
  });
});
