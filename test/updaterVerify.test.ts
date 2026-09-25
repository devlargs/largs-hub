import { describe, expect, it } from "vitest";
import { downloadProblem, isRedirectStatus, parseContentLength } from "../electron/updater/verify";

const SHA = "b".repeat(64);

describe("isRedirectStatus", () => {
  it("follows every redirect status", () => {
    for (const code of [301, 302, 303, 307, 308]) expect(isRedirectStatus(code)).toBe(true);
  });

  it("doesn't treat anything else as a redirect", () => {
    for (const code of [200, 204, 304, 404, 500, undefined]) {
      expect(isRedirectStatus(code)).toBe(false);
    }
  });
});

describe("parseContentLength", () => {
  it("reads a byte count", () => {
    expect(parseContentLength("1048576")).toBe(1048576);
    expect(parseContentLength("0")).toBe(0);
  });

  it("gives null when there's no usable size", () => {
    expect(parseContentLength(undefined)).toBeNull();
    expect(parseContentLength("")).toBeNull();
    expect(parseContentLength("-5")).toBeNull();
    expect(parseContentLength("12abc")).toBeNull();
    expect(parseContentLength("99999999999999999999")).toBeNull();
  });
});

describe("downloadProblem", () => {
  const ok = { expectedSha256: SHA, actualSha256: SHA, expectedBytes: 100, receivedBytes: 100 };

  it("accepts a complete download that matches its checksum", () => {
    expect(downloadProblem(ok)).toBeNull();
    expect(downloadProblem({ ...ok, actualSha256: SHA.toUpperCase() })).toBeNull();
  });

  it("accepts a matching download when the server gave no size", () => {
    expect(downloadProblem({ ...ok, expectedBytes: null, receivedBytes: 7 })).toBeNull();
  });

  it("rejects a download cut short or overlong", () => {
    expect(downloadProblem({ ...ok, receivedBytes: 60 })).toMatch(/incomplete: got 60 of 100/);
    expect(downloadProblem({ ...ok, receivedBytes: 120 })).toMatch(/incomplete/);
  });

  it("rejects a checksum mismatch", () => {
    expect(downloadProblem({ ...ok, actualSha256: "c".repeat(64) })).toMatch(/checksum mismatch/);
  });
});
