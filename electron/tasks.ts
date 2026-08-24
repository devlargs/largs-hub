import { ipcMain, safeStorage, WebContentsView } from "electron";
import { randomUUID } from "crypto";
import {
  PendingSync,
  RemoteTask,
  Task,
  carryOverTasks,
  clearDeleted,
  clearDirty,
  emptyPending,
  isDateKey,
  markDeleted,
  markDirty,
  mergeRemoteTasks,
  nextOrder,
  normalizeDatabaseId,
  pendingCount,
  reorderTasks,
  sanitizeTaskText,
  tasksForDate,
} from "./tasksLogic";

// Pomodoro: a daily task list with an optional Notion database behind it.
// Local state in electron-store is always the source of truth for writes — the
// UI never waits on the network — and a per-service queue pushes changes to
// Notion in the background. All Notion HTTP stays in the main process (the API
// blocks browser CORS, and it keeps the integration token out of the renderer).

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
// Notion caps rich_text content at 2000 chars
const RICH_TEXT_LIMIT = 2000;
// Push debounce: a burst of checkbox toggles becomes one flush
const FLUSH_DEBOUNCE_MS = 400;
// Retry backoff after a failed flush (offline, rate limit, …)
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

export interface PomodoroNotionConfig {
  apiKey: string;
  databaseId: string;
  titleProp: string;
  // false while we wait for the user to decide about a non-empty database
  ready: boolean;
  // The non-empty database already carries our conventions (a Done checkbox),
  // i.e. it holds tasks from a previous connection — offer to keep them
  adoptable?: boolean;
}

export interface PomodoroData {
  tasks: Task[];
  pending: PendingSync;
  // date -> epoch ms of the last successful pull for that day
  pulledAt: Record<string, number>;
}

export type SyncStatus = "local" | "synced" | "syncing" | "offline";

export interface SyncState {
  serviceId: string;
  status: SyncStatus;
  pending: number;
  error?: string;
}

export interface PomodoroStore {
  get(key: "pomodoroTasks"): Record<string, PomodoroData> | undefined;
  set(key: "pomodoroTasks", value: Record<string, PomodoroData>): void;
  get(key: "pomodoroNotion"): Record<string, PomodoroNotionConfig> | undefined;
  set(key: "pomodoroNotion", value: Record<string, PomodoroNotionConfig>): void;
}

interface PomodoroDeps {
  store: PomodoroStore;
  getUiView: () => WebContentsView | null;
  // A task is gone — the timer bound to it (if any) has nothing left to time
  onTaskRemoved: (serviceId: string, taskId: string) => void;
}

// --- Notion REST types (only the fields we read) ---

interface NotionRichText {
  plain_text: string;
}

interface NotionPropertyValue {
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  checkbox?: boolean;
  date?: { start: string } | null;
  number?: number | null;
}

interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, NotionPropertyValue>;
}

interface NotionDatabase {
  properties: Record<string, { type: string }>;
}

interface NotionQueryPage {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

class NotionError extends Error {}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong talking to Notion.";
}

async function notionRequest<T = unknown>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new NotionError("Could not reach the Notion API — check your internet connection.");
  });
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) {
    throw new NotionError(
      data && typeof data.message === "string"
        ? data.message
        : `Notion API error (HTTP ${res.status})`,
    );
  }
  return data as T;
}

function richText(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, RICH_TEXT_LIMIT) } }];
}

function plainText(rich: NotionRichText[] | undefined): string {
  return (rich || []).map((t) => t.plain_text).join("");
}

function findTitleProp(db: NotionDatabase): string | null {
  for (const [name, prop] of Object.entries(db.properties)) {
    if (prop.type === "title") return name;
  }
  return null;
}

// The four properties one task page needs. Created on connect, the same way the
// old note taker set up its Pinned checkbox.
async function ensureSchema(apiKey: string, databaseId: string, db: NotionDatabase) {
  const missing: Record<string, unknown> = {};
  if (db.properties["Done"]?.type !== "checkbox") missing["Done"] = { checkbox: {} };
  if (db.properties["Date"]?.type !== "date") missing["Date"] = { date: {} };
  if (db.properties["Order"]?.type !== "number") missing["Order"] = { number: {} };
  if (Object.keys(missing).length === 0) return;
  await notionRequest(apiKey, "PATCH", `/databases/${databaseId}`, { properties: missing });
}

function pageToRemoteTask(config: PomodoroNotionConfig, page: NotionPage): RemoteTask | null {
  const titleValue = page.properties[config.titleProp];
  const text = plainText(titleValue?.title ?? titleValue?.rich_text).trim();
  const date = page.properties["Date"]?.date?.start?.slice(0, 10);
  if (!isDateKey(date)) return null; // not one of ours / no day to file it under
  return {
    pageId: page.id,
    text: text || "Untitled task",
    done: page.properties["Done"]?.checkbox === true,
    date,
    order: page.properties["Order"]?.number ?? 0,
    editedAt: page.last_edited_time,
  };
}

function buildProperties(config: PomodoroNotionConfig, task: Task) {
  return {
    [config.titleProp]: { title: richText(task.text) },
    Done: { checkbox: task.done },
    Date: { date: { start: task.date } },
    Order: { number: task.order },
  };
}

// --- API key encryption at rest ---------------------------------------------
// The integration token is a full-access credential; never persist it in
// plaintext. Stored as "enc:<base64>"; plaintext values are migrated on save.
const ENC_PREFIX = "enc:";

function encryptApiKey(apiKey: string): string {
  if (apiKey.startsWith(ENC_PREFIX)) return apiKey;
  if (!safeStorage.isEncryptionAvailable()) return apiKey; // best-effort fallback
  return ENC_PREFIX + safeStorage.encryptString(apiKey).toString("base64");
}

function decryptApiKey(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), "base64"));
  } catch {
    return ""; // keychain reset — treat as disconnected
  }
}

export function registerPomodoro(deps: PomodoroDeps): void {
  const { store } = deps;

  // --- persistence -----------------------------------------------------------

  const getData = (serviceId: string): PomodoroData => {
    const all = store.get("pomodoroTasks") || {};
    const data = all[serviceId];
    return {
      tasks: Array.isArray(data?.tasks) ? data.tasks : [],
      pending: data?.pending ?? emptyPending(),
      pulledAt: data?.pulledAt ?? {},
    };
  };

  const saveData = (serviceId: string, data: PomodoroData) => {
    const all = store.get("pomodoroTasks") || {};
    all[serviceId] = data;
    store.set("pomodoroTasks", all);
  };

  const getConfig = (serviceId: string): PomodoroNotionConfig | null => {
    const all = store.get("pomodoroNotion") || {};
    const config = all[serviceId];
    if (!config) return null;
    return { ...config, apiKey: decryptApiKey(config.apiKey) };
  };

  const saveConfig = (serviceId: string, config: PomodoroNotionConfig) => {
    // Re-read raw configs and encrypt every key on the way out, which also
    // migrates any legacy plaintext entry.
    const all = store.get("pomodoroNotion") || {};
    all[serviceId] = config;
    const encrypted: Record<string, PomodoroNotionConfig> = {};
    for (const [id, cfg] of Object.entries(all)) {
      encrypted[id] = { ...cfg, apiKey: encryptApiKey(decryptApiKey(cfg.apiKey)) };
    }
    store.set("pomodoroNotion", encrypted);
  };

  const dropConfig = (serviceId: string) => {
    const all = store.get("pomodoroNotion") || {};
    if (all[serviceId]) {
      delete all[serviceId];
      store.set("pomodoroNotion", all);
    }
  };

  // --- UI pushes -------------------------------------------------------------

  const send = (channel: string, payload: unknown) => {
    const ui = deps.getUiView();
    if (ui && !ui.webContents.isDestroyed()) ui.webContents.send(channel, payload);
  };

  // Live sync state per service; rebuilt from the queue so it survives restarts
  const syncErrors = new Map<string, string>();
  const flushing = new Set<string>();

  function syncState(serviceId: string): SyncState {
    const config = getConfig(serviceId);
    if (!config?.ready) return { serviceId, status: "local", pending: 0 };
    const pending = pendingCount(getData(serviceId).pending);
    const error = syncErrors.get(serviceId);
    if (flushing.has(serviceId)) return { serviceId, status: "syncing", pending };
    if (error) return { serviceId, status: "offline", pending, error };
    return { serviceId, status: pending > 0 ? "syncing" : "synced", pending };
  }

  const pushSync = (serviceId: string) => send("pomodoro-sync-updated", syncState(serviceId));

  const pushTasks = (serviceId: string) =>
    send("pomodoro-tasks-updated", { serviceId, tasks: getData(serviceId).tasks });

  // --- background flush ------------------------------------------------------

  const flushTimers = new Map<string, NodeJS.Timeout>();
  const retryAttempts = new Map<string, number>();

  function scheduleFlush(serviceId: string, delayMs = FLUSH_DEBOUNCE_MS) {
    const existing = flushTimers.get(serviceId);
    if (existing) clearTimeout(existing);
    flushTimers.set(
      serviceId,
      setTimeout(() => {
        flushTimers.delete(serviceId);
        void flush(serviceId);
      }, delayMs),
    );
  }

  // Pushes every queued change for a service. One failure stops the run and
  // schedules a backoff retry — the queue is persistent, so nothing is lost if
  // the app closes mid-flight.
  async function flush(serviceId: string): Promise<void> {
    if (flushing.has(serviceId)) return;
    const config = getConfig(serviceId);
    if (!config?.ready) return;
    if (pendingCount(getData(serviceId).pending) === 0) return;

    flushing.add(serviceId);
    pushSync(serviceId);
    try {
      // Deletions first: a task removed right after being created should not
      // leave a page behind if the create is still queued.
      for (const pageId of [...getData(serviceId).pending.deleted]) {
        await notionRequest(config.apiKey, "PATCH", `/pages/${pageId}`, { archived: true });
        const data = getData(serviceId);
        saveData(serviceId, { ...data, pending: clearDeleted(data.pending, pageId) });
      }

      for (const taskId of [...getData(serviceId).pending.dirty]) {
        const data = getData(serviceId);
        const task = data.tasks.find((t) => t.id === taskId);
        if (!task) {
          saveData(serviceId, { ...data, pending: clearDirty(data.pending, taskId) });
          continue;
        }
        if (task.pageId) {
          await notionRequest(config.apiKey, "PATCH", `/pages/${task.pageId}`, {
            properties: buildProperties(config, task),
          });
          const after = getData(serviceId);
          saveData(serviceId, { ...after, pending: clearDirty(after.pending, taskId) });
        } else {
          const page = await notionRequest<NotionPage>(config.apiKey, "POST", "/pages", {
            parent: { database_id: config.databaseId },
            properties: buildProperties(config, task),
          });
          const after = getData(serviceId);
          saveData(serviceId, {
            ...after,
            tasks: after.tasks.map((t) => (t.id === taskId ? { ...t, pageId: page.id } : t)),
            pending: clearDirty(after.pending, taskId),
          });
          pushTasks(serviceId);
        }
      }
      syncErrors.delete(serviceId);
      retryAttempts.delete(serviceId);
    } catch (err) {
      syncErrors.set(serviceId, errorMessage(err));
      const attempt = retryAttempts.get(serviceId) ?? 0;
      retryAttempts.set(serviceId, attempt + 1);
      scheduleFlush(serviceId, RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    } finally {
      flushing.delete(serviceId);
      pushSync(serviceId);
    }
  }

  // Records local changes and kicks off a push. Every mutation funnels through
  // here so local state and the queue can't drift apart.
  function commit(serviceId: string, tasks: Task[], dirtyIds: string[], deleted?: Task[]) {
    const data = getData(serviceId);
    let pending = markDirty(data.pending, dirtyIds);
    for (const task of deleted ?? []) pending = markDeleted(pending, task);
    saveData(serviceId, { ...data, tasks, pending });
    if (getConfig(serviceId)?.ready) {
      scheduleFlush(serviceId);
      pushSync(serviceId);
    }
  }

  // --- pull ------------------------------------------------------------------

  async function queryDate(config: PomodoroNotionConfig, date: string): Promise<RemoteTask[]> {
    const results: RemoteTask[] = [];
    let cursor: string | null = null;
    do {
      const body: Record<string, unknown> = {
        page_size: 100,
        filter: { property: "Date", date: { equals: date } },
      };
      if (cursor) body.start_cursor = cursor;
      const res: NotionQueryPage = await notionRequest<NotionQueryPage>(
        config.apiKey,
        "POST",
        `/databases/${config.databaseId}/query`,
        body,
      );
      for (const page of res.results) {
        const task = pageToRemoteTask(config, page);
        if (task) results.push(task);
      }
      cursor = res.has_more ? res.next_cursor : null;
    } while (cursor);
    return results;
  }

  // Pulls one day and folds it into local state. Scoped to a single day so
  // browsing back through months never queries the whole database.
  async function pullDate(serviceId: string, date: string): Promise<string | null> {
    const config = getConfig(serviceId);
    if (!config?.ready) return null;
    try {
      const remote = await queryDate(config, date);
      const data = getData(serviceId);
      const merged = mergeRemoteTasks(data.tasks, remote, date, data.pending, () => randomUUID());
      saveData(serviceId, {
        ...data,
        tasks: merged,
        pulledAt: { ...data.pulledAt, [date]: Date.now() },
      });
      syncErrors.delete(serviceId);
      pushTasks(serviceId);
      pushSync(serviceId);
      return null;
    } catch (err) {
      const message = errorMessage(err);
      syncErrors.set(serviceId, message);
      pushSync(serviceId);
      return message;
    }
  }

  // --- IPC -------------------------------------------------------------------

  const requireServiceId = (value: unknown): string => {
    if (typeof value !== "string" || !value) throw new NotionError("Invalid service id.");
    return value;
  };

  ipcMain.handle("pomodoro-get-state", (_event, serviceIdRaw: unknown) => {
    if (typeof serviceIdRaw !== "string") return "local";
    const config = getConfig(serviceIdRaw);
    if (!config) return "local";
    if (config.ready) return "ready";
    return config.adoptable ? "pending-adoptable" : "pending";
  });

  // Tasks for one day, straight from the local store (instant), plus whether a
  // background pull is worth doing.
  ipcMain.handle("pomodoro-list", (_event, serviceIdRaw: unknown, dateRaw: unknown) => {
    try {
      const serviceId = requireServiceId(serviceIdRaw);
      if (!isDateKey(dateRaw)) return { ok: false, error: "Invalid date." };
      const data = getData(serviceId);
      return {
        ok: true,
        tasks: tasksForDate(data.tasks, dateRaw),
        pulledAt: data.pulledAt[dateRaw] ?? 0,
        sync: syncState(serviceId),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  // Force a pull for a day (mount refresh / the Refresh button).
  ipcMain.handle("pomodoro-refresh", async (_event, serviceIdRaw: unknown, dateRaw: unknown) => {
    try {
      const serviceId = requireServiceId(serviceIdRaw);
      if (!isDateKey(dateRaw)) return { ok: false, error: "Invalid date." };
      const error = await pullDate(serviceId, dateRaw);
      const data = getData(serviceId);
      return {
        ok: !error,
        error: error ?? undefined,
        tasks: tasksForDate(data.tasks, dateRaw),
        sync: syncState(serviceId),
      };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(
    "pomodoro-create",
    (_event, serviceIdRaw: unknown, dateRaw: unknown, textRaw: unknown) => {
      try {
        const serviceId = requireServiceId(serviceIdRaw);
        if (!isDateKey(dateRaw)) return { ok: false, error: "Invalid date." };
        const text = sanitizeTaskText(textRaw);
        if (!text) return { ok: false, error: "Task text is required." };
        const data = getData(serviceId);
        const task: Task = {
          id: randomUUID(),
          text,
          done: false,
          date: dateRaw,
          order: nextOrder(data.tasks, dateRaw),
          editedAt: new Date().toISOString(),
          focusSessions: 0,
        };
        commit(serviceId, [...data.tasks, task], [task.id]);
        return { ok: true, task, tasks: tasksForDate(getData(serviceId).tasks, dateRaw) };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle(
    "pomodoro-update",
    (_event, serviceIdRaw: unknown, taskIdRaw: unknown, patchRaw: unknown) => {
      try {
        const serviceId = requireServiceId(serviceIdRaw);
        if (typeof taskIdRaw !== "string") return { ok: false, error: "Invalid task id." };
        if (typeof patchRaw !== "object" || patchRaw === null) {
          return { ok: false, error: "Invalid task payload." };
        }
        const patch = patchRaw as { text?: unknown; done?: unknown };
        const data = getData(serviceId);
        const existing = data.tasks.find((t) => t.id === taskIdRaw);
        if (!existing) return { ok: false, error: "Task not found." };

        let text = existing.text;
        if (patch.text !== undefined) {
          const clean = sanitizeTaskText(patch.text);
          if (!clean) return { ok: false, error: "Task text is required." };
          text = clean;
        }
        const done = patch.done === undefined ? existing.done : patch.done === true;
        const updated: Task = { ...existing, text, done, editedAt: new Date().toISOString() };
        commit(
          serviceId,
          data.tasks.map((t) => (t.id === updated.id ? updated : t)),
          [updated.id],
        );
        return { ok: true, task: updated, tasks: tasksForDate(getData(serviceId).tasks, updated.date) };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle("pomodoro-remove", (_event, serviceIdRaw: unknown, taskIdRaw: unknown) => {
    try {
      const serviceId = requireServiceId(serviceIdRaw);
      if (typeof taskIdRaw !== "string") return { ok: false, error: "Invalid task id." };
      const data = getData(serviceId);
      const task = data.tasks.find((t) => t.id === taskIdRaw);
      if (!task) return { ok: true, tasks: [] };
      deps.onTaskRemoved(serviceId, task.id);
      commit(
        serviceId,
        data.tasks.filter((t) => t.id !== task.id),
        [],
        [task],
      );
      return { ok: true, tasks: tasksForDate(getData(serviceId).tasks, task.date) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(
    "pomodoro-reorder",
    (_event, serviceIdRaw: unknown, dateRaw: unknown, idsRaw: unknown) => {
      try {
        const serviceId = requireServiceId(serviceIdRaw);
        if (!isDateKey(dateRaw)) return { ok: false, error: "Invalid date." };
        if (!Array.isArray(idsRaw) || idsRaw.some((id) => typeof id !== "string")) {
          return { ok: false, error: "Invalid task order." };
        }
        const data = getData(serviceId);
        const { tasks, changed } = reorderTasks(
          data.tasks,
          dateRaw,
          idsRaw as string[],
          new Date().toISOString(),
        );
        commit(serviceId, tasks, changed);
        return { ok: true, tasks: tasksForDate(tasks, dateRaw) };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  // Moves yesterday's unfinished tasks onto the given day.
  ipcMain.handle(
    "pomodoro-carry-over",
    (_event, serviceIdRaw: unknown, fromRaw: unknown, toRaw: unknown) => {
      try {
        const serviceId = requireServiceId(serviceIdRaw);
        if (!isDateKey(fromRaw) || !isDateKey(toRaw)) return { ok: false, error: "Invalid date." };
        const data = getData(serviceId);
        const { tasks, moved } = carryOverTasks(
          data.tasks,
          fromRaw,
          toRaw,
          new Date().toISOString(),
        );
        commit(serviceId, tasks, moved);
        return { ok: true, moved: moved.length, tasks: tasksForDate(tasks, toRaw) };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  // How many unfinished tasks the previous day still holds — drives the
  // "Carry over N tasks" button without loading that day into the UI.
  ipcMain.handle("pomodoro-pending-count", (_event, serviceIdRaw: unknown, dateRaw: unknown) => {
    if (typeof serviceIdRaw !== "string" || !isDateKey(dateRaw)) return 0;
    return tasksForDate(getData(serviceIdRaw).tasks, dateRaw).filter((t) => !t.done).length;
  });

  ipcMain.handle("pomodoro-sync-state", (_event, serviceIdRaw: unknown): SyncState | null =>
    typeof serviceIdRaw === "string" ? syncState(serviceIdRaw) : null,
  );

  // Retry a stalled queue on demand (the sync pill is clickable when offline).
  ipcMain.handle("pomodoro-retry-sync", (_event, serviceIdRaw: unknown) => {
    if (typeof serviceIdRaw !== "string") return null;
    syncErrors.delete(serviceIdRaw);
    retryAttempts.delete(serviceIdRaw);
    scheduleFlush(serviceIdRaw, 0);
    return syncState(serviceIdRaw);
  });

  // --- connection ------------------------------------------------------------

  ipcMain.handle(
    "pomodoro-connect",
    async (_event, serviceIdRaw: unknown, apiKeyRaw: unknown, databaseIdRaw: unknown) => {
      try {
        if (
          typeof serviceIdRaw !== "string" ||
          typeof apiKeyRaw !== "string" ||
          typeof databaseIdRaw !== "string"
        ) {
          return { ok: false, error: "Invalid connection details." };
        }
        const apiKey = apiKeyRaw.trim();
        if (!apiKey) return { ok: false, error: "Please paste your Notion API key." };
        const databaseId = normalizeDatabaseId(databaseIdRaw);
        if (!databaseId) {
          return { ok: false, error: "That doesn't look like a Notion database ID or URL." };
        }

        // Validates the key, the ID, and that the database is shared with the integration
        const db = await notionRequest<NotionDatabase>(apiKey, "GET", `/databases/${databaseId}`);
        const titleProp = findTitleProp(db);
        if (!titleProp) {
          return {
            ok: false,
            error: "This database has no title property. Please use a regular Notion database.",
          };
        }

        const probe = await notionRequest<NotionQueryPage>(
          apiKey,
          "POST",
          `/databases/${databaseId}/query`,
          { page_size: 1 },
        );
        if (probe.results.length > 0) {
          // Not empty — wait for the user before touching anything. A Done
          // checkbox means it already follows our conventions, so these are
          // almost certainly tasks from a previous connection.
          const adoptable = db.properties["Done"]?.type === "checkbox";
          saveConfig(serviceIdRaw, { apiKey, databaseId, titleProp, ready: false, adoptable });
          return { ok: true, needsReset: true, adoptable };
        }

        await ensureSchema(apiKey, databaseId, db);
        saveConfig(serviceIdRaw, { apiKey, databaseId, titleProp, ready: true });
        // Everything already in the local store now belongs in Notion
        const data = getData(serviceIdRaw);
        commit(
          serviceIdRaw,
          data.tasks,
          data.tasks.map((t) => t.id),
        );
        pushSync(serviceIdRaw);
        return { ok: true, needsReset: false };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle("pomodoro-reset-database", async (_event, serviceIdRaw: unknown) => {
    try {
      const serviceId = requireServiceId(serviceIdRaw);
      const config = getConfig(serviceId);
      if (!config) return { ok: false, error: "Notion database is not connected yet." };
      // User confirmed: archive every existing page, then repurpose the schema
      let cursor: string | null = null;
      do {
        const body: Record<string, unknown> = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const res: NotionQueryPage = await notionRequest<NotionQueryPage>(
          config.apiKey,
          "POST",
          `/databases/${config.databaseId}/query`,
          body,
        );
        for (const page of res.results) {
          await notionRequest(config.apiKey, "PATCH", `/pages/${page.id}`, { archived: true });
        }
        cursor = res.has_more ? res.next_cursor : null;
      } while (cursor);

      const db = await notionRequest<NotionDatabase>(
        config.apiKey,
        "GET",
        `/databases/${config.databaseId}`,
      );
      await ensureSchema(config.apiKey, config.databaseId, db);
      saveConfig(serviceId, { ...config, ready: true, adoptable: false });
      // Local tasks survive the wipe and are (re)pushed as fresh pages
      const data = getData(serviceId);
      const tasks = data.tasks.map((t) => ({ ...t, pageId: undefined }));
      saveData(serviceId, { ...data, tasks, pulledAt: {} });
      commit(
        serviceId,
        tasks,
        tasks.map((t) => t.id),
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  // Keep the database's existing pages as tasks instead of wiping them — the
  // non-destructive counterpart to reset-database for reconnects.
  ipcMain.handle("pomodoro-adopt-database", async (_event, serviceIdRaw: unknown) => {
    try {
      const serviceId = requireServiceId(serviceIdRaw);
      const config = getConfig(serviceId);
      if (!config) return { ok: false, error: "Notion database is not connected yet." };
      // Re-verify against the live schema rather than trusting the stored flag
      const db = await notionRequest<NotionDatabase>(
        config.apiKey,
        "GET",
        `/databases/${config.databaseId}`,
      );
      if (db.properties["Done"]?.type !== "checkbox") {
        return {
          ok: false,
          error:
            "This database no longer looks like a Largs Hub task database. Empty it or connect a different one.",
        };
      }
      await ensureSchema(config.apiKey, config.databaseId, db);
      saveConfig(serviceId, { ...config, ready: true, adoptable: false });
      const data = getData(serviceId);
      saveData(serviceId, { ...data, pulledAt: {} });
      commit(
        serviceId,
        data.tasks,
        data.tasks.map((t) => t.id),
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  // Back to local-only mode: credentials and page links go, tasks stay.
  ipcMain.handle("pomodoro-disconnect", (_event, serviceIdRaw: unknown) => {
    if (typeof serviceIdRaw !== "string") return;
    dropConfig(serviceIdRaw);
    const timer = flushTimers.get(serviceIdRaw);
    if (timer) clearTimeout(timer);
    flushTimers.delete(serviceIdRaw);
    syncErrors.delete(serviceIdRaw);
    retryAttempts.delete(serviceIdRaw);
    const data = getData(serviceIdRaw);
    saveData(serviceIdRaw, {
      tasks: data.tasks.map((t) => ({ ...t, pageId: undefined })),
      pending: emptyPending(),
      pulledAt: {},
    });
    pushTasks(serviceIdRaw);
    pushSync(serviceIdRaw);
  });

  // Push anything still queued as soon as the app starts.
  for (const serviceId of Object.keys(store.get("pomodoroTasks") || {})) {
    if (pendingCount(getData(serviceId).pending) > 0) scheduleFlush(serviceId, 2_000);
  }
}

// Drops a service's tasks and credentials (called when the service is removed).
export function forgetPomodoroService(store: PomodoroStore, serviceId: string): void {
  const tasks = store.get("pomodoroTasks") || {};
  if (tasks[serviceId]) {
    delete tasks[serviceId];
    store.set("pomodoroTasks", tasks);
  }
  const configs = store.get("pomodoroNotion") || {};
  if (configs[serviceId]) {
    delete configs[serviceId];
    store.set("pomodoroNotion", configs);
  }
}

// Records a completed focus session against a task (called by the timer).
export function recordFocusSession(
  store: PomodoroStore,
  serviceId: string,
  taskId: string,
): void {
  const all = store.get("pomodoroTasks") || {};
  const data = all[serviceId];
  if (!data) return;
  data.tasks = data.tasks.map((t) =>
    t.id === taskId ? { ...t, focusSessions: (t.focusSessions ?? 0) + 1 } : t,
  );
  store.set("pomodoroTasks", all);
}
