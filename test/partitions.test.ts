import path from "path";
import { describe, expect, it } from "vitest";
import {
  PartitionSweepFs,
  orphanedPartitionDirs,
  servicePartition,
  sweepOrphanedPartitions,
} from "../electron/partitions";

const dirent = (name: string, isDir = true) => ({ name, isDirectory: () => isDir });

// A fake fs that lists the given entries and records what it was asked to delete.
function fakeFs(
  entries: { name: string; isDirectory(): boolean }[],
  removed: string[] = [],
  readdirError?: Error,
): PartitionSweepFs {
  return {
    readdirSync() {
      if (readdirError) throw readdirError;
      return entries;
    },
    rmSync(target) {
      removed.push(target);
    },
  };
}

describe("servicePartition", () => {
  it("namespaces the id under a persistent partition", () => {
    expect(servicePartition("abc")).toBe("persist:service-abc");
  });
});

describe("orphanedPartitionDirs", () => {
  it("keeps partitions whose service still exists", () => {
    expect(orphanedPartitionDirs(["service-a", "service-b"], ["a", "b"])).toEqual([]);
  });

  it("returns partitions with no matching service", () => {
    expect(orphanedPartitionDirs(["service-a", "service-b"], ["a"])).toEqual(["service-b"]);
  });

  it("ignores directories that are not service partitions", () => {
    expect(orphanedPartitionDirs(["Default", "link-preview", "service-a"], [])).toEqual([
      "service-a",
    ]);
  });

  it("leaves escaped or unusual names alone rather than guessing", () => {
    expect(orphanedPartitionDirs(["service-a%2Fb", "service-"], [])).toEqual([]);
  });
});

describe("sweepOrphanedPartitions", () => {
  it("deletes only the orphaned directories", () => {
    const removed: string[] = [];
    const result = sweepOrphanedPartitions(
      ["keep"],
      "/parts",
      fakeFs([dirent("service-keep"), dirent("service-gone")], removed),
    );
    expect(result).toEqual(["service-gone"]);
    expect(removed).toEqual([path.join("/parts", "service-gone")]);
  });

  it("skips files that merely look like partitions", () => {
    const removed: string[] = [];
    expect(
      sweepOrphanedPartitions([], "/parts", fakeFs([dirent("service-gone", false)], removed)),
    ).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("returns nothing when there is no Partitions directory", () => {
    expect(sweepOrphanedPartitions([], "/parts", fakeFs([], [], new Error("ENOENT")))).toEqual([]);
  });
});
