// Runs at most one `task` at a time: while one is in flight, every call gets
// that same promise back instead of starting another. Keeps a second "Update
// now" (from the lock screen, or after leaving Settings and coming back) from
// downloading the update again into a second temp folder.
export function singleFlight<T>(task: () => Promise<T>) {
  let current: Promise<T> | null = null;
  const run = (): Promise<T> => {
    if (!current) {
      current = task().finally(() => {
        current = null;
      });
    }
    return current;
  };
  return { run, isRunning: () => current !== null };
}
