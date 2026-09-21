// On-demand runs of a main-process badge fetcher (Gmail's Atom feed).
//
// The feed is the authoritative count, but it was only ever read on a fixed
// 20-second timer — so a new email, or one just read, took up to 20 seconds
// to reach the badge (and twice that for a drop, before the debounce learned
// to trust the feed). Gmail's tab title changes the instant its count does,
// even in the background, so a title change is the signal to read the feed
// now rather than wait for the timer.
//
// A burst of title updates collapses into one set of fetches. The follow-up
// fetch covers the feed lagging a few seconds behind the Gmail UI: the first
// read can still see the old count, the second catches up.
//
// Only timers, no Electron — unit-tested with fake timers
// (test/fetchTrigger.test.ts).

/** Delays after a trigger at which the fetcher runs. */
export const TRIGGER_FETCH_DELAYS_MS = [1_000, 6_000];

export interface FetchTrigger {
  /** Schedule fresh fetches, replacing any not yet run. */
  trigger(): void;
  /** Cancel anything scheduled. */
  dispose(): void;
}

export function createFetchTrigger(
  fetch: () => void,
  delaysMs: readonly number[] = TRIGGER_FETCH_DELAYS_MS,
): FetchTrigger {
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  };
  return {
    trigger() {
      clear();
      timers = delaysMs.map((delay) => setTimeout(fetch, delay));
    },
    dispose: clear,
  };
}
