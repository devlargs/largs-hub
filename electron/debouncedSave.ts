// Coalesces partial updates to one stored object behind a debounce.
//
// Window bounds change on every resize/move tick, and electron-store writes the
// whole config file synchronously, so window/create.ts buffers those writes here. Pure
// and Electron-free (see test/debouncedSave.test.ts).

export interface DebouncedSaver<T> {
  // Merge `partial` into the pending value; the first change arms the write
  save(partial: Partial<T>): void;
  // Write anything still pending now, e.g. when the window closes
  flush(): void;
}

export function createDebouncedSaver<T extends object>(options: {
  read: () => T;
  write: (value: T) => void;
  delayMs: number;
}): DebouncedSaver<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      options.write(pending);
      pending = null;
    }
  };

  return {
    save(partial) {
      pending = { ...(pending ?? options.read()), ...partial };
      // The first change arms the timer; later ones ride along with it
      if (!timer) timer = setTimeout(flush, options.delayMs);
    },
    flush,
  };
}
