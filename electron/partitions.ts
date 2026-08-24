import { app, session } from "electron";
import path from "path";
import fs from "fs";

// Per-service session partitions. Each service browses in `persist:service-<id>`
// so logins stay isolated, and Chromium keeps that partition's cookies, storage
// and cache under `userData/Partitions/service-<id>`.
//
// Removing a service has to take the partition with it: otherwise "remove"
// leaves a live login cookie on disk that nothing can ever reach again, because
// re-adding the service mints a fresh id and a fresh partition.

const PARTITION_PREFIX = "service-";

export function servicePartition(serviceId: string): string {
  return `persist:${PARTITION_PREFIX}${serviceId}`;
}

export function partitionsDir(): string {
  return path.join(app.getPath("userData"), "Partitions");
}

// Wipe cookies, localStorage, IndexedDB, service workers and the HTTP cache for
// one service. Best-effort: a failure here must never block removing a service.
export async function clearServiceSessionData(serviceId: string): Promise<void> {
  try {
    const ses = session.fromPartition(servicePartition(serviceId));
    await ses.clearStorageData();
    await ses.clearCache();
  } catch (err) {
    console.error(`Failed to clear session data for service ${serviceId}:`, err);
  }
}

// Pure: which partition directories belong to no current service.
//
// Only names of the form `service-<id>` are considered, and only when the id is
// plain enough that Chromium would have written it through unescaped — anything
// else is left alone rather than guessed at.
export function orphanedPartitionDirs(dirNames: string[], serviceIds: string[]): string[] {
  const live = new Set(serviceIds);
  return dirNames.filter((name) => {
    if (!name.startsWith(PARTITION_PREFIX)) return false;
    const id = name.slice(PARTITION_PREFIX.length);
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return false;
    return !live.has(id);
  });
}

export interface PartitionSweepFs {
  readdirSync(dir: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  rmSync(target: string, options: { recursive: true; force: true }): void;
}

// Reclaim partitions orphaned by earlier versions (or by a removal that failed
// halfway). Runs at startup, before any service view instantiates a session, so
// nothing being deleted is in use.
export function sweepOrphanedPartitions(
  serviceIds: string[],
  dir: string = partitionsDir(),
  fsImpl: PartitionSweepFs = fs,
): string[] {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = fsImpl.readdirSync(dir, { withFileTypes: true });
  } catch {
    // No Partitions directory yet — nothing to sweep.
    return [];
  }
  const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const removed: string[] = [];
  for (const name of orphanedPartitionDirs(dirNames, serviceIds)) {
    try {
      fsImpl.rmSync(path.join(dir, name), { recursive: true, force: true });
      removed.push(name);
    } catch (err) {
      console.error(`Failed to remove orphaned partition ${name}:`, err);
    }
  }
  return removed;
}
