// The timing and randomness behind the task scheduler, pure so it can be
// unit-tested (test/automationSchedule.test.ts). `random` defaults to
// Math.random and is only passed by tests.

// The next moment the wall clock reads `hhmm` ("0930"): later today, or
// tomorrow if that time has already passed (or is exactly now).
export function nextDailyFireAt(hhmm: string, now: number): number {
  const hours = parseInt(hhmm.slice(0, 2), 10);
  const minutes = parseInt(hhmm.slice(2, 4), 10);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

// A whole number of seconds between fromSec and toSec inclusive, in ms.
export function randomDelayMs(fromSec: number, toSec: number, random = Math.random): number {
  return Math.floor(random() * (toSec - fromSec + 1) + fromSec) * 1000;
}

// One emoji burst: the emoji repeated 1 to maxLength times.
export function emojiBurst(emoji: string, maxLength: number, random = Math.random): string {
  return emoji.repeat(1 + Math.floor(random() * maxLength));
}
