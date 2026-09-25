// Checks on the update download itself (issue #122). Pure, so each rule is
// unit-tested (test/updaterVerify.test.ts); download.ts does the I/O.

// Every redirect GitHub (or a CDN in front of it) may answer with. Each hop is
// still checked against the host allowlist before it's followed.
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRedirectStatus(statusCode: number | undefined): boolean {
  return statusCode !== undefined && REDIRECT_STATUSES.has(statusCode);
}

/** The size the server announced, or null when it gave none (or nonsense). */
export function parseContentLength(header: string | undefined): number | null {
  if (!header || !/^\d+$/.test(header)) return null;
  const bytes = Number(header);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

export interface DownloadResult {
  expectedSha256: string;
  actualSha256: string;
  /** From Content-Length, or null when the server didn't say. */
  expectedBytes: number | null;
  receivedBytes: number;
}

/**
 * Why a finished download must not be installed, or null when it may be. The
 * checksum is what makes it safe: a short read or a swapped file can't match.
 * The size check only gives a clearer error for a cut-off download.
 */
export function downloadProblem({
  expectedSha256,
  actualSha256,
  expectedBytes,
  receivedBytes,
}: DownloadResult): string | null {
  if (expectedBytes !== null && receivedBytes !== expectedBytes) {
    return `Update download incomplete: got ${receivedBytes} of ${expectedBytes} bytes`;
  }
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return "Update rejected: checksum mismatch";
  }
  return null;
}
