import { createHash } from "node:crypto";
import type { CloudWorkspace } from "./shared/types";

// The workspace's fingerprint, so a push that changes nothing is skipped
// (ipc/cloud.ts). Pure; re-exported by cloudWorkspace.ts.

// JSON with object keys sorted at every level, so key order never changes it.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A hash of the workspace, to skip pushes that change nothing. */
export function workspaceFingerprint(workspace: CloudWorkspace): string {
  return createHash("sha256").update(stableStringify(workspace)).digest("hex");
}

/** Size of the workspace as it would be stored, in bytes (roughly). */
export function workspaceSize(workspace: CloudWorkspace): number {
  return JSON.stringify(workspace).length;
}
