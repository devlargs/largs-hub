import { ipcMain } from "electron";
import { store } from "../store";
import {
  ListGroupResult,
  MessageListGroup,
  sanitizeMessageListGroup,
  sanitizeStoredGroups,
} from "../messageLists";

// IPC: CRUD for the saved message lists used by the Messenger "Random list"
// automation. Every mutation returns the full updated list so the renderer can
// replace its state in one go, matching ipc/services.ts.

export interface ListGroupsResult {
  ok: boolean;
  error?: string;
  groups: MessageListGroup[];
}

function readGroups(): MessageListGroup[] {
  return sanitizeStoredGroups(store.get("messageListGroups"));
}

export function registerListGroupsIpc() {
  ipcMain.handle("get-list-groups", (): MessageListGroup[] => readGroups());

  ipcMain.handle("add-list-group", (_event, raw: unknown): ListGroupsResult => {
    const groups = readGroups();
    const result: ListGroupResult = sanitizeMessageListGroup(raw, Date.now());
    if (!result.ok) return { ok: false, error: result.error, groups };
    if (groups.some((g) => g.id === result.group.id)) {
      return { ok: false, error: "That list already exists", groups };
    }
    const updated = [...groups, result.group];
    store.set("messageListGroups", updated);
    return { ok: true, groups: updated };
  });

  ipcMain.handle("update-list-group", (_event, raw: unknown): ListGroupsResult => {
    const groups = readGroups();
    const result = sanitizeMessageListGroup(raw, Date.now());
    if (!result.ok) return { ok: false, error: result.error, groups };
    const existing = groups.find((g) => g.id === result.group.id);
    if (!existing) return { ok: false, error: "That list no longer exists", groups };
    // createdAt belongs to the original; only the edit stamps updatedAt.
    const merged: MessageListGroup = {
      ...result.group,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    const updated = groups.map((g) => (g.id === merged.id ? merged : g));
    store.set("messageListGroups", updated);
    return { ok: true, groups: updated };
  });

  // A running task holds its own copy of the messages, so deleting the list it
  // came from deliberately leaves that task running to completion.
  ipcMain.handle("remove-list-group", (_event, groupId: unknown): ListGroupsResult => {
    const groups = readGroups();
    if (typeof groupId !== "string") return { ok: false, error: "Invalid list", groups };
    const updated = groups.filter((g) => g.id !== groupId);
    store.set("messageListGroups", updated);
    return { ok: true, groups: updated };
  });
}
