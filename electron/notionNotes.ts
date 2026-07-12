import { ipcMain, safeStorage } from "electron";

// Notion-backed note taker ("Notion Note Taker" internal service).
// All Notion API traffic happens here in the main process — the Notion API
// does not allow browser CORS requests, and this keeps the API key out of
// the renderer.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
// Notion caps rich_text content at 2000 chars and children at 100 per request
const RICH_TEXT_LIMIT = 2000;
const BLOCK_BATCH = 100;

export interface NotionNotesConfig {
  apiKey: string;
  databaseId: string;
  titleProp: string;
  // false while we wait for the user to confirm emptying a non-empty database
  ready: boolean;
  // Set while pending: the non-empty database already follows this app's
  // conventions (Pinned checkbox), i.e. it holds notes from a previous
  // connection — offer to keep them instead of only wiping (issue #36)
  adoptable?: boolean;
}

export interface NotionNotesStore {
  get(key: "notionNotes"): Record<string, NotionNotesConfig> | undefined;
  set(key: "notionNotes", value: Record<string, NotionNotesConfig>): void;
}

interface NoteItem {
  text: string;
  checked: boolean;
}

interface Note {
  id: string;
  title: string;
  kind: "text" | "list";
  text: string;
  items: NoteItem[];
  imageUrl?: string;
  pinned: boolean;
  editedAt: string;
}

type NoteImageAction =
  | { action: "keep" }
  | { action: "remove" }
  | { action: "upload"; fileName: string; mimeType: string; base64: string };

interface NoteInput {
  title: string;
  kind: "text" | "list";
  text: string;
  items: NoteItem[];
  pinned: boolean;
  image?: NoteImageAction;
}

// --- Notion REST types (only the fields we read) ---

interface NotionRichText {
  plain_text: string;
}

interface NotionPropertyValue {
  type: string;
  title?: NotionRichText[];
  checkbox?: boolean;
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

interface NotionBlock {
  id: string;
  type: string;
  paragraph?: { rich_text: NotionRichText[] };
  heading_1?: { rich_text: NotionRichText[] };
  heading_2?: { rich_text: NotionRichText[] };
  heading_3?: { rich_text: NotionRichText[] };
  bulleted_list_item?: { rich_text: NotionRichText[] };
  numbered_list_item?: { rich_text: NotionRichText[] };
  to_do?: { rich_text: NotionRichText[]; checked: boolean };
  image?: { type: string; file?: { url: string }; external?: { url: string } };
}

interface NotionBlockList {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionFileUpload {
  id: string;
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

function plainText(rich: NotionRichText[] | undefined): string {
  return (rich || []).map((t) => t.plain_text).join("");
}

// Exported for unit tests
export function richText(content: string): { type: "text"; text: { content: string } }[] {
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < content.length; i += RICH_TEXT_LIMIT) {
    chunks.push({ type: "text", text: { content: content.slice(i, i + RICH_TEXT_LIMIT) } });
  }
  return chunks;
}

// Accepts a raw ID (dashed or not) or a full Notion URL. Exported for unit tests.
export function normalizeDatabaseId(raw: string): string | null {
  const input = raw.trim();
  const dashed = input.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i);
  if (dashed) return dashed[0];
  const plain = input.match(/[0-9a-f]{32}/i);
  return plain ? plain[0] : null;
}

function findTitleProp(db: NotionDatabase): string | null {
  for (const [name, prop] of Object.entries(db.properties)) {
    if (prop.type === "title") return name;
  }
  return null;
}

async function ensurePinnedProperty(apiKey: string, databaseId: string, db: NotionDatabase) {
  const pinned = db.properties["Pinned"];
  if (!pinned || pinned.type !== "checkbox") {
    await notionRequest(apiKey, "PATCH", `/databases/${databaseId}`, {
      properties: { Pinned: { checkbox: {} } },
    });
  }
}

async function queryAllPages(config: NotionNotesConfig): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    };
    if (cursor) body.start_cursor = cursor;
    const res = await notionRequest<NotionQueryPage>(
      config.apiKey,
      "POST",
      `/databases/${config.databaseId}/query`,
      body,
    );
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

async function fetchAllBlocks(apiKey: string, blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor
      ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
      : "?page_size=100";
    const res: NotionBlockList = await notionRequest<NotionBlockList>(
      apiKey,
      "GET",
      `/blocks/${blockId}/children${query}`,
    );
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return blocks;
}

// Exported for unit tests
export function blocksToContent(blocks: NotionBlock[]): {
  kind: "text" | "list";
  text: string;
  items: NoteItem[];
  imageUrl?: string;
} {
  const lines: string[] = [];
  const items: NoteItem[] = [];
  let imageUrl: string | undefined;
  for (const block of blocks) {
    switch (block.type) {
      case "image":
        if (!imageUrl) imageUrl = block.image?.file?.url || block.image?.external?.url;
        break;
      case "to_do":
        items.push({ text: plainText(block.to_do?.rich_text), checked: block.to_do?.checked === true });
        break;
      case "paragraph":
        lines.push(plainText(block.paragraph?.rich_text));
        break;
      case "heading_1":
        lines.push(plainText(block.heading_1?.rich_text));
        break;
      case "heading_2":
        lines.push(plainText(block.heading_2?.rich_text));
        break;
      case "heading_3":
        lines.push(plainText(block.heading_3?.rich_text));
        break;
      case "bulleted_list_item":
        lines.push("• " + plainText(block.bulleted_list_item?.rich_text));
        break;
      case "numbered_list_item":
        lines.push("• " + plainText(block.numbered_list_item?.rich_text));
        break;
      default:
        // Block types we don't render (created by editing in Notion) are skipped
        break;
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return {
    kind: items.length > 0 ? "list" : "text",
    text: lines.join("\n"),
    items,
    imageUrl,
  };
}

async function pageToNote(config: NotionNotesConfig, page: NotionPage): Promise<Note> {
  const blocks = await fetchAllBlocks(config.apiKey, page.id);
  const content = blocksToContent(blocks);
  let title = "";
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title") {
      title = plainText(prop.title);
      break;
    }
  }
  const pinnedProp = page.properties["Pinned"];
  return {
    id: page.id,
    title,
    ...content,
    pinned: pinnedProp?.type === "checkbox" && pinnedProp.checkbox === true,
    editedAt: page.last_edited_time,
  };
}

function buildChildren(input: NoteInput, fileUploadId?: string): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = [];
  if (fileUploadId) {
    children.push({
      object: "block",
      type: "image",
      image: { type: "file_upload", file_upload: { id: fileUploadId } },
    });
  }
  if (input.text) {
    for (const line of input.text.split("\n")) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richText(line) },
      });
    }
  }
  if (input.kind === "list") {
    for (const item of input.items) {
      children.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: richText(item.text), checked: item.checked },
      });
    }
  }
  return children;
}

function buildProperties(config: NotionNotesConfig, input: NoteInput): Record<string, unknown> {
  return {
    [config.titleProp]: { title: richText(input.title) },
    Pinned: { checkbox: input.pinned },
  };
}

async function appendChildren(
  apiKey: string,
  blockId: string,
  children: Record<string, unknown>[],
) {
  for (let i = 0; i < children.length; i += BLOCK_BATCH) {
    await notionRequest(apiKey, "PATCH", `/blocks/${blockId}/children`, {
      children: children.slice(i, i + BLOCK_BATCH),
    });
  }
}

async function uploadImage(
  apiKey: string,
  image: { fileName: string; mimeType: string; base64: string },
): Promise<string> {
  const fileBuffer = Buffer.from(image.base64, "base64");
  if (fileBuffer.length > 20 * 1024 * 1024) {
    throw new NotionError("Image is too large for Notion (max 20 MB).");
  }
  const created = await notionRequest<NotionFileUpload>(apiKey, "POST", "/file_uploads", {
    mode: "single_part",
    filename: image.fileName,
    content_type: image.mimeType,
  });

  // Node's fetch handles Buffer bodies; build the multipart payload by hand
  const boundary = `----LargsHubUpload${Date.now().toString(16)}`;
  const safeName = image.fileName.replace(/["\r\n]/g, "_");
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${image.mimeType}\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${NOTION_API}/file_uploads/${created.id}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  }).catch(() => {
    throw new NotionError("Uploading the image to Notion failed.");
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new NotionError(data?.message || `Image upload failed (HTTP ${res.status})`);
  }
  return created.id;
}

// Exported for unit tests
export function sanitizeNoteInput(raw: unknown): NoteInput | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== "string" || typeof obj.text !== "string") return null;
  if (obj.kind !== "text" && obj.kind !== "list") return null;
  if (!Array.isArray(obj.items)) return null;
  const items: NoteItem[] = [];
  for (const entry of obj.items) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.text !== "string") return null;
    items.push({ text: item.text, checked: item.checked === true });
  }
  let image: NoteImageAction | undefined;
  if (obj.image !== undefined && obj.image !== null) {
    if (typeof obj.image !== "object") return null;
    const rawImage = obj.image as Record<string, unknown>;
    if (rawImage.action === "keep" || rawImage.action === "remove") {
      image = { action: rawImage.action };
    } else if (
      rawImage.action === "upload" &&
      typeof rawImage.fileName === "string" &&
      typeof rawImage.mimeType === "string" &&
      typeof rawImage.base64 === "string"
    ) {
      image = {
        action: "upload",
        fileName: rawImage.fileName,
        mimeType: rawImage.mimeType,
        base64: rawImage.base64,
      };
    } else {
      return null;
    }
  }
  return { title: obj.title, kind: obj.kind, text: obj.text, items, pinned: obj.pinned === true, image };
}

// Rapid edits to the same note (e.g. checkbox toggles) must not interleave —
// updates delete and re-append the page's blocks, so serialize them per note.
const noteLocks = new Map<string, Promise<unknown>>();
function withNoteLock<T>(noteId: string, fn: () => Promise<T>): Promise<T> {
  const prev = noteLocks.get(noteId) || Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  noteLocks.set(noteId, tail);
  // Evict once settled so the map doesn't retain one entry per note ever edited
  tail.then(() => {
    if (noteLocks.get(noteId) === tail) noteLocks.delete(noteId);
  });
  return next;
}

// --- API key encryption at rest -------------------------------------------
// The Notion integration token is a full-access credential; never persist it
// in plaintext. Encrypted values are stored as "enc:<base64>"; plaintext
// values (from versions before this change) are migrated on next save.
const ENC_PREFIX = "enc:";

function encryptApiKey(apiKey: string): string {
  if (apiKey.startsWith(ENC_PREFIX)) return apiKey; // already encrypted
  if (!safeStorage.isEncryptionAvailable()) return apiKey; // best effort fallback
  return ENC_PREFIX + safeStorage.encryptString(apiKey).toString("base64");
}

function decryptApiKey(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), "base64"));
  } catch {
    return ""; // decryption failed (e.g. OS keychain reset) — treat as disconnected
  }
}

export function registerNotionNotes(store: NotionNotesStore) {
  const getConfigs = (): Record<string, NotionNotesConfig> => {
    const configs = store.get("notionNotes") || {};
    const out: Record<string, NotionNotesConfig> = {};
    for (const [id, cfg] of Object.entries(configs)) {
      out[id] = { ...cfg, apiKey: decryptApiKey(cfg.apiKey) };
    }
    return out;
  };
  const saveConfig = (serviceId: string, config: NotionNotesConfig) => {
    // Re-read raw configs and encrypt every key on the way out, which also
    // migrates any legacy plaintext entries.
    const configs = store.get("notionNotes") || {};
    configs[serviceId] = config;
    const encrypted: Record<string, NotionNotesConfig> = {};
    for (const [id, cfg] of Object.entries(configs)) {
      encrypted[id] = { ...cfg, apiKey: encryptApiKey(decryptApiKey(cfg.apiKey)) };
    }
    store.set("notionNotes", encrypted);
  };
  const requireConfig = (serviceId: unknown, mustBeReady = true): NotionNotesConfig => {
    if (typeof serviceId !== "string") throw new NotionError("Invalid service id.");
    const config = getConfigs()[serviceId];
    if (!config || (mustBeReady && !config.ready)) {
      throw new NotionError("Notion database is not connected yet.");
    }
    return config;
  };

  ipcMain.handle("notion-notes-get-state", (_event, serviceId: unknown) => {
    if (typeof serviceId !== "string") return "none";
    const config = getConfigs()[serviceId];
    if (!config) return "none";
    if (config.ready) return "ready";
    return config.adoptable ? "pending-adoptable" : "pending";
  });

  ipcMain.handle(
    "notion-notes-connect",
    async (_event, serviceId: unknown, apiKeyRaw: unknown, databaseIdRaw: unknown) => {
      try {
        if (
          typeof serviceId !== "string" ||
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
          return { ok: false, error: "This database has no title property. Please use a regular Notion database." };
        }

        const probe = await notionRequest<NotionQueryPage>(
          apiKey,
          "POST",
          `/databases/${databaseId}/query`,
          { page_size: 1 },
        );
        if (probe.results.length > 0) {
          // Not empty — wait for the user to confirm before touching anything.
          // A Pinned checkbox means the database already follows this app's
          // conventions (it's only ever added by our setup), so these are
          // almost certainly notes from a previous connection — e.g. the
          // service was deleted and re-added, or the app was reinstalled
          // (issue #36). Offer to keep them instead of only wiping.
          const adoptable = db.properties["Pinned"]?.type === "checkbox";
          saveConfig(serviceId, { apiKey, databaseId, titleProp, ready: false, adoptable });
          return { ok: true, needsReset: true, adoptable };
        }

        await ensurePinnedProperty(apiKey, databaseId, db);
        saveConfig(serviceId, { apiKey, databaseId, titleProp, ready: true });
        return { ok: true, needsReset: false };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle("notion-notes-reset-database", async (_event, serviceId: unknown) => {
    try {
      const config = requireConfig(serviceId, false);
      // User confirmed: move every existing page to trash, then repurpose the schema
      const pages = await queryAllPages(config);
      for (const page of pages) {
        await notionRequest(config.apiKey, "PATCH", `/pages/${page.id}`, { archived: true });
      }
      const db = await notionRequest<NotionDatabase>(
        config.apiKey,
        "GET",
        `/databases/${config.databaseId}`,
      );
      await ensurePinnedProperty(config.apiKey, config.databaseId, db);
      saveConfig(serviceId as string, { ...config, ready: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  // Keep the database's existing pages as notes instead of wiping them — the
  // non-destructive counterpart to reset-database for reconnects (issue #36).
  ipcMain.handle("notion-notes-adopt-database", async (_event, serviceId: unknown) => {
    try {
      const config = requireConfig(serviceId, false);
      // Re-verify against the live schema rather than trusting the stored
      // adoptable flag — the database may have changed since connect.
      const db = await notionRequest<NotionDatabase>(
        config.apiKey,
        "GET",
        `/databases/${config.databaseId}`,
      );
      if (db.properties["Pinned"]?.type !== "checkbox") {
        return {
          ok: false,
          error:
            "This database no longer looks like a Largs Hub notes database. Empty it or connect a different one.",
        };
      }
      saveConfig(serviceId as string, { ...config, ready: true, adoptable: false });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle("notion-notes-disconnect", (_event, serviceId: unknown) => {
    if (typeof serviceId !== "string") return;
    // Operate on the raw stored configs (keys stay encrypted at rest)
    const configs = store.get("notionNotes") || {};
    if (configs[serviceId]) {
      delete configs[serviceId];
      store.set("notionNotes", configs);
    }
  });

  ipcMain.handle("notion-notes-list", async (_event, serviceId: unknown) => {
    try {
      const config = requireConfig(serviceId);
      const pages = await queryAllPages(config);
      const notes = await mapWithConcurrency(pages, 3, (page) => pageToNote(config, page));
      return { ok: true, notes };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle("notion-notes-create", async (_event, serviceId: unknown, rawInput: unknown) => {
    try {
      const config = requireConfig(serviceId);
      const input = sanitizeNoteInput(rawInput);
      if (!input) return { ok: false, error: "Invalid note payload." };
      const fileUploadId =
        input.image?.action === "upload" ? await uploadImage(config.apiKey, input.image) : undefined;
      const children = buildChildren(input, fileUploadId);
      const page = await notionRequest<NotionPage>(config.apiKey, "POST", "/pages", {
        parent: { database_id: config.databaseId },
        properties: buildProperties(config, input),
        ...(children.length > 0 ? { children: children.slice(0, BLOCK_BATCH) } : {}),
      });
      if (children.length > BLOCK_BATCH) {
        await appendChildren(config.apiKey, page.id, children.slice(BLOCK_BATCH));
      }
      return { ok: true, note: await pageToNote(config, page) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  ipcMain.handle(
    "notion-notes-update",
    async (_event, serviceId: unknown, noteId: unknown, rawInput: unknown) => {
      try {
        const config = requireConfig(serviceId);
        if (typeof noteId !== "string") return { ok: false, error: "Invalid note id." };
        const input = sanitizeNoteInput(rawInput);
        if (!input) return { ok: false, error: "Invalid note payload." };

        const note = await withNoteLock(noteId, async () => {
          // Upload the replacement image first so a failed upload leaves the note intact
          const fileUploadId =
            input.image?.action === "upload"
              ? await uploadImage(config.apiKey, input.image)
              : undefined;

          const existing = await fetchAllBlocks(config.apiKey, noteId);
          const keepImage = input.image?.action === "keep";
          let imageKept = false;
          for (const block of existing) {
            if (keepImage && !imageKept && block.type === "image") {
              imageKept = true;
              continue;
            }
            await notionRequest(config.apiKey, "DELETE", `/blocks/${block.id}`);
          }
          const children = buildChildren(input, fileUploadId);
          if (children.length > 0) {
            await appendChildren(config.apiKey, noteId, children);
          }
          const page = await notionRequest<NotionPage>(config.apiKey, "PATCH", `/pages/${noteId}`, {
            properties: buildProperties(config, input),
          });
          return pageToNote(config, page);
        });
        return { ok: true, note };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle(
    "notion-notes-set-pinned",
    async (_event, serviceId: unknown, noteId: unknown, pinned: unknown) => {
      try {
        const config = requireConfig(serviceId);
        if (typeof noteId !== "string") return { ok: false, error: "Invalid note id." };
        const note = await withNoteLock(noteId, async () => {
          const page = await notionRequest<NotionPage>(config.apiKey, "PATCH", `/pages/${noteId}`, {
            properties: { Pinned: { checkbox: pinned === true } },
          });
          return pageToNote(config, page);
        });
        return { ok: true, note };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle("notion-notes-remove", async (_event, serviceId: unknown, noteId: unknown) => {
    try {
      const config = requireConfig(serviceId);
      if (typeof noteId !== "string") return { ok: false, error: "Invalid note id." };
      await withNoteLock(noteId, () =>
        notionRequest(config.apiKey, "PATCH", `/pages/${noteId}`, { archived: true }),
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
}

// Exported for unit tests
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
