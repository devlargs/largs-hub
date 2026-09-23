// Waits for `promise`, but never longer than `ms`. Resolves true if it settled
// (fulfilled or rejected) in time, false if the wait ran out. Never rejects.
//
// For work that must not hold something else up forever: the Chrome identity
// override is awaited before a service view's first load, and a DevTools
// protocol command that never answers left every service blank (v0.1.67).
// Pure (test/settleWithin.test.ts).
export function settleWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(true);
      },
    );
  });
}
