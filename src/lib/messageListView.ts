import type { MessageListGroup } from "../types";

// Search, paging and wording for the saved message lists picker. The lists are
// local and small, so this happens in the renderer rather than the IPC layer.
// Pure so it can be unit-tested.

export const PAGE_SIZE = 10;

// One message per line; blank lines and surrounding spaces don't count.
export function parseMessages(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function messageCountLabel(count: number): string {
  return `${count} message${count === 1 ? "" : "s"}`;
}

// Lists whose name contains `query` (ignoring case), most recently changed first.
export function filterLists(groups: MessageListGroup[], query: string): MessageListGroup[] {
  const needle = query.trim().toLowerCase();
  const matching = needle ? groups.filter((g) => g.name.toLowerCase().includes(needle)) : groups;
  return [...matching].sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface Page<T> {
  items: T[];
  // Zero-based, clamped into range
  page: number;
  pageCount: number;
}

// One page of `items`. A deletion or a new search can strand the requested
// page past the last one, so it's clamped; an empty list still has one page.
export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  return {
    items: items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    page: safePage,
    pageCount,
  };
}
