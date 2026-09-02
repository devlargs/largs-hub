// Counting for the download toast (issue #99).
//
// One toast is shown at a time and reused, so it has to say how many downloads
// it stands for: "Downloaded 1/2" while the second is still coming in,
// "Downloaded 2/2" once it lands. Pure, so the counting is unit-tested without
// an Electron runtime (CLAUDE.md); the window itself lives in downloads.ts.

export interface ToastBatch {
  /** Downloads begun in this batch that are still expected to finish. */
  started: number;
  /** Of those, the ones that finished successfully. */
  completed: number;
  /** Still in flight. */
  inFlight: number;
}

export const EMPTY_BATCH: ToastBatch = { started: 0, completed: 0, inFlight: 0 };

/**
 * A batch is a run of downloads the user thinks of as one thing. It starts over
 * once nothing is downloading and the last toast has been dismissed — otherwise
 * a download an hour later would count itself as "3/3" of a long-gone batch.
 */
export function beginDownload(batch: ToastBatch, toastOpen: boolean): ToastBatch {
  if (batch.inFlight === 0 && !toastOpen) {
    return { started: 1, completed: 0, inFlight: 1 };
  }
  return { ...batch, started: batch.started + 1, inFlight: batch.inFlight + 1 };
}

/**
 * A cancelled or failed download is taken back out of the total rather than
 * counted against it — otherwise the toast would sit at "1/2" forever.
 */
export function finishDownload(batch: ToastBatch, completed: boolean): ToastBatch {
  return {
    started: completed ? batch.started : Math.max(0, batch.started - 1),
    completed: completed ? batch.completed + 1 : batch.completed,
    inFlight: Math.max(0, batch.inFlight - 1),
  };
}

/** The toast's leading label: a plain "Download complete" until there's more than one. */
export function toastLabel(batch: ToastBatch): string {
  if (batch.started <= 1) return "Download complete";
  return `Downloaded ${batch.completed}/${batch.started}`;
}

/** True once nothing in the batch is still downloading. */
export function batchSettled(batch: ToastBatch): boolean {
  return batch.inFlight === 0;
}
