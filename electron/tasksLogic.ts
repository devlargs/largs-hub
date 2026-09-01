// Pure logic for the Todo task service: day bucketing, ordering,
// carry-over, and the sync queue. Kept free of Electron/Notion imports so it
// can be unit-tested (see test/tasksLogic.test.ts) and reasoned about on its
// own — electron/tasks.ts holds the IPC + Notion side.

export interface Task {
  id: string;
  text: string;
  done: boolean;
  // The day the task belongs to, as YYYY-MM-DD in the user's local time
  date: string;
  // Manual position within the day (ascending)
  order: number;
  // Notion page id, set once the task has been pushed. Absent = local only.
  pageId?: string;
  // ISO timestamp of the last local edit — compared against Notion's
  // last_edited_time for last-write-wins
  editedAt: string;
}

// Work waiting to be pushed to Notion. Task ids (not operations) so repeated
// edits to the same task collapse on their own; deleted tasks are gone from
// local state by then, so their page id is queued instead.
export interface PendingSync {
  dirty: string[];
  deleted: string[];
}

export const emptyPending = (): PendingSync => ({ dirty: [], deleted: [] });

export function pendingCount(pending: PendingSync): number {
  return pending.dirty.length + pending.deleted.length;
}

// --- Dates -------------------------------------------------------------------

// Local-time YYYY-MM-DD. toISOString() would shift the day for anyone east or
// west of UTC, which is exactly the bug a daily task list can't afford.
export function dateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Days added to (or subtracted from) a YYYY-MM-DD key, handling month and year
// boundaries via Date's own normalisation.
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

// --- Ordering / bucketing ----------------------------------------------------

// Within a day: manual order first, then oldest-first for ties (two tasks can
// share an order after a Notion pull that lost the number).
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.order - b.order || a.editedAt.localeCompare(b.editedAt));
}

export function tasksForDate(tasks: Task[], date: string): Task[] {
  return sortTasks(tasks.filter((t) => t.date === date));
}

export function bucketByDate(tasks: Task[]): Record<string, Task[]> {
  const buckets: Record<string, Task[]> = {};
  for (const task of tasks) {
    (buckets[task.date] ||= []).push(task);
  }
  for (const date of Object.keys(buckets)) buckets[date] = sortTasks(buckets[date]);
  return buckets;
}

export function nextOrder(tasks: Task[], date: string): number {
  const existing = tasks.filter((t) => t.date === date);
  return existing.length === 0 ? 0 : Math.max(...existing.map((t) => t.order)) + 1;
}

// Applies a drag-reorder: ids not in `orderedIds` keep their relative position
// after the ones that are, so a stale list from the renderer can't drop tasks.
export function reorderTasks(
  tasks: Task[],
  date: string,
  orderedIds: string[],
  now: string,
): { tasks: Task[]; changed: string[] } {
  const inDay = tasksForDate(tasks, date);
  const byId = new Map(inDay.map((t) => [t.id, t]));
  const ordered: Task[] = [];
  for (const id of orderedIds) {
    const task = byId.get(id);
    if (task) {
      ordered.push(task);
      byId.delete(id);
    }
  }
  for (const task of inDay) if (byId.has(task.id)) ordered.push(task);

  const changed: string[] = [];
  const updates = new Map<string, Task>();
  ordered.forEach((task, index) => {
    if (task.order !== index) {
      changed.push(task.id);
      updates.set(task.id, { ...task, order: index, editedAt: now });
    }
  });
  return {
    tasks: tasks.map((t) => updates.get(t.id) ?? t),
    changed,
  };
}

// --- Carry over --------------------------------------------------------------

// Moves every unfinished task from `fromDate` onto `toDate`, appended after
// whatever is already there. Moving (rather than copying) keeps the completed
// history of a past day honest — an undone task was never part of it.
export function carryOverTasks(
  tasks: Task[],
  fromDate: string,
  toDate: string,
  now: string,
): { tasks: Task[]; moved: string[] } {
  const pending = tasksForDate(tasks, fromDate).filter((t) => !t.done);
  if (pending.length === 0) return { tasks, moved: [] };

  let order = nextOrder(tasks, toDate);
  const moves = new Map<string, Task>();
  for (const task of pending) {
    moves.set(task.id, { ...task, date: toDate, order: order++, editedAt: now });
  }
  return {
    tasks: tasks.map((t) => moves.get(t.id) ?? t),
    moved: [...moves.keys()],
  };
}

// --- Sync queue --------------------------------------------------------------

export function markDirty(pending: PendingSync, taskIds: string[]): PendingSync {
  const dirty = new Set(pending.dirty);
  for (const id of taskIds) dirty.add(id);
  return { dirty: [...dirty], deleted: pending.deleted };
}

// A task that was never pushed has no page to archive, so deleting it simply
// drops it from the dirty list — nothing has to reach Notion at all.
export function markDeleted(pending: PendingSync, task: Task): PendingSync {
  const dirty = pending.dirty.filter((id) => id !== task.id);
  if (!task.pageId) return { dirty, deleted: pending.deleted };
  const deleted = pending.deleted.includes(task.pageId)
    ? pending.deleted
    : [...pending.deleted, task.pageId];
  return { dirty, deleted };
}

export function clearDirty(pending: PendingSync, taskId: string): PendingSync {
  return { dirty: pending.dirty.filter((id) => id !== taskId), deleted: pending.deleted };
}

export function clearDeleted(pending: PendingSync, pageId: string): PendingSync {
  return { dirty: pending.dirty, deleted: pending.deleted.filter((id) => id !== pageId) };
}

// --- Merge (pull) ------------------------------------------------------------

export interface RemoteTask {
  pageId: string;
  text: string;
  done: boolean;
  date: string;
  order: number;
  editedAt: string;
}

// Folds one day's worth of Notion pages into local state. Rules:
//  - a task with unpushed local edits always wins (its push is still queued)
//  - otherwise the newer last-edited timestamp wins
//  - a local task whose page vanished remotely was deleted in Notion
//  - a local task with no page id yet is a pending creation, never dropped
export function mergeRemoteTasks(
  local: Task[],
  remote: RemoteTask[],
  date: string,
  pending: PendingSync,
  newId: (pageId: string) => string,
): Task[] {
  const dirty = new Set(pending.dirty);
  const byPageId = new Map<string, Task>();
  for (const task of local) if (task.pageId) byPageId.set(task.pageId, task);

  const merged: Task[] = [];
  const seenPageIds = new Set<string>();

  for (const task of local) {
    if (task.date !== date) {
      merged.push(task); // another day — this pull says nothing about it
      continue;
    }
    if (!task.pageId) {
      merged.push(task); // never pushed — keep waiting
      continue;
    }
    const match = remote.find((r) => r.pageId === task.pageId);
    if (!match) {
      // Deleted in Notion, unless we're still holding an edit for it
      if (dirty.has(task.id)) merged.push(task);
      continue;
    }
    seenPageIds.add(match.pageId);
    if (dirty.has(task.id) || task.editedAt >= match.editedAt) {
      merged.push(task);
    } else {
      merged.push({
        ...task,
        text: match.text,
        done: match.done,
        date: match.date,
        order: match.order,
        editedAt: match.editedAt,
      });
    }
  }

  for (const entry of remote) {
    if (seenPageIds.has(entry.pageId) || byPageId.has(entry.pageId)) continue;
    merged.push({
      id: newId(entry.pageId),
      text: entry.text,
      done: entry.done,
      date: entry.date,
      order: entry.order,
      pageId: entry.pageId,
      editedAt: entry.editedAt,
    });
  }

  return merged;
}

// --- Validation --------------------------------------------------------------

export const MAX_TASK_TEXT = 500;

export function sanitizeTaskText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Newlines would break the single-line row layout; collapse them
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_TASK_TEXT) return null;
  return text;
}

// Accepts a raw ID (dashed or not) or a full Notion URL.
export function normalizeDatabaseId(raw: string): string | null {
  const input = raw.trim();
  const dashed = input.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i);
  if (dashed) return dashed[0];
  const plain = input.match(/[0-9a-f]{32}/i);
  return plain ? plain[0] : null;
}
