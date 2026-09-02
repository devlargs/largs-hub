import { describe, expect, it } from "vitest";
import {
  EMPTY_BATCH,
  ToastBatch,
  batchSettled,
  beginDownload,
  finishDownload,
  toastLabel,
} from "../electron/downloadToastBatch";

// Walks a batch through a sequence of "start"/"ok"/"fail" steps, with the toast
// assumed open from the first completion until the caller says otherwise.
const run = (steps: ("start" | "ok" | "fail")[], toastOpen = false): ToastBatch =>
  steps.reduce<ToastBatch>((batch, step) => {
    if (step === "start") return beginDownload(batch, toastOpen || batch.completed > 0);
    return finishDownload(batch, step === "ok");
  }, EMPTY_BATCH);

describe("toastLabel", () => {
  it("says nothing about counts for a lone download", () => {
    expect(toastLabel(run(["start", "ok"]))).toBe("Download complete");
  });

  it("counts off a batch as each file lands", () => {
    expect(toastLabel(run(["start", "start", "ok"]))).toBe("Downloaded 1/2");
    expect(toastLabel(run(["start", "start", "ok", "ok"]))).toBe("Downloaded 2/2");
  });

  it("counts a download that starts while the toast is still up", () => {
    // First finishes and shows its toast, then a second is kicked off.
    expect(toastLabel(run(["start", "ok", "start", "ok"]))).toBe("Downloaded 2/2");
  });
});

describe("beginDownload", () => {
  it("starts a fresh batch when nothing is in flight and no toast is up", () => {
    const stale: ToastBatch = { started: 3, completed: 3, inFlight: 0 };
    expect(beginDownload(stale, false)).toEqual({ started: 1, completed: 0, inFlight: 1 });
  });

  it("joins the existing batch while a toast is still on screen", () => {
    const shown: ToastBatch = { started: 1, completed: 1, inFlight: 0 };
    expect(beginDownload(shown, true)).toEqual({ started: 2, completed: 1, inFlight: 1 });
  });

  it("joins the existing batch while something is still downloading", () => {
    const busy: ToastBatch = { started: 1, completed: 0, inFlight: 1 };
    expect(beginDownload(busy, false)).toEqual({ started: 2, completed: 0, inFlight: 2 });
  });
});

describe("finishDownload", () => {
  it("takes a cancelled download back out of the total", () => {
    // Two started, one cancelled: the toast reads as a single download, not 1/2.
    expect(toastLabel(run(["start", "start", "fail", "ok"]))).toBe("Download complete");
  });

  it("leaves a batch of three reading 2/2 when one is cancelled", () => {
    expect(toastLabel(run(["start", "start", "start", "ok", "fail", "ok"]))).toBe("Downloaded 2/2");
  });

  it("never counts below zero", () => {
    expect(finishDownload(EMPTY_BATCH, false)).toEqual(EMPTY_BATCH);
  });
});

describe("batchSettled", () => {
  it("is true only once nothing is still downloading", () => {
    expect(batchSettled(EMPTY_BATCH)).toBe(true);
    expect(batchSettled(run(["start"]))).toBe(false);
    expect(batchSettled(run(["start", "start", "ok"]))).toBe(false);
    expect(batchSettled(run(["start", "start", "ok", "ok"]))).toBe(true);
  });
});
