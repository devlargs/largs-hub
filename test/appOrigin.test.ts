import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { isAppUrl, isFromApp, setAppEntryUrl } from "../electron/appOrigin";

// The UI view holds window.electronAPI, so only the app's own page may stay in
// it or call the sensitive IPC handlers (issue #112).

const DEV = "http://localhost:5173";
const PROD_WIN = "file:///C:/Program%20Files/Largs%20Hub/resources/app.asar/dist/index.html";
const PROD_MAC = "file:///Applications/Largs%20Hub.app/Contents/Resources/app.asar/dist/index.html";

describe("isAppUrl in dev", () => {
  it("accepts the dev server, with any path, query or hash", () => {
    expect(isAppUrl("http://localhost:5173/", DEV)).toBe(true);
    expect(isAppUrl("http://localhost:5173/#/settings", DEV)).toBe(true);
    expect(isAppUrl("http://localhost:5173/src/main.tsx?t=1", DEV)).toBe(true);
  });

  it("refuses other origins, even on localhost", () => {
    expect(isAppUrl("http://localhost:3000/", DEV)).toBe(false);
    expect(isAppUrl("https://localhost:5173/", DEV)).toBe(false);
    expect(isAppUrl("http://127.0.0.1:5173/", DEV)).toBe(false);
    expect(isAppUrl("https://www.messenger.com/", DEV)).toBe(false);
  });
});

describe("isAppUrl in production", () => {
  it("accepts the built index.html, with a query or hash", () => {
    expect(isAppUrl(PROD_WIN, PROD_WIN)).toBe(true);
    expect(isAppUrl(`${PROD_WIN}#/changelog`, PROD_WIN)).toBe(true);
    expect(isAppUrl(`${PROD_MAC}?x=1`, PROD_MAC)).toBe(true);
  });

  it("matches however the path's spaces are encoded", () => {
    expect(
      isAppUrl("file:///C:/Program Files/Largs Hub/resources/app.asar/dist/index.html", PROD_WIN),
    ).toBe(true);
  });

  it.runIf(process.platform === "win32")("ignores the drive letter's case on Windows", () => {
    expect(
      isAppUrl(
        "file:///c:/Program%20Files/Largs%20Hub/resources/app.asar/dist/index.html",
        PROD_WIN,
      ),
    ).toBe(true);
  });

  it("refuses a dropped file", () => {
    expect(isAppUrl("file:///C:/Users/me/Desktop/evil.html", PROD_WIN)).toBe(false);
    expect(
      isAppUrl(
        "file:///C:/Program%20Files/Largs%20Hub/resources/app.asar/dist/other.html",
        PROD_WIN,
      ),
    ).toBe(false);
    expect(isAppUrl("file:///Users/me/Downloads/index.html", PROD_MAC)).toBe(false);
  });

  it("refuses a dropped web link", () => {
    expect(isAppUrl("https://example.com/", PROD_WIN)).toBe(false);
    expect(isAppUrl("http://localhost:5173/", PROD_WIN)).toBe(false);
  });
});

describe("isAppUrl with odd input", () => {
  it("refuses empty, malformed and non-page URLs", () => {
    for (const url of [
      undefined,
      null,
      "",
      "not a url",
      "about:blank",
      "data:text/html,<p>hi</p>",
      "javascript:alert(1)",
    ]) {
      expect(isAppUrl(url, PROD_WIN), String(url)).toBe(false);
      expect(isAppUrl(url, DEV), String(url)).toBe(false);
    }
  });

  it("refuses everything against a malformed entry URL", () => {
    expect(isAppUrl(PROD_WIN, "nonsense")).toBe(false);
  });
});

describe("isFromApp", () => {
  const eventFrom = (url: string | null) =>
    ({ senderFrame: url === null ? null : { url } }) as unknown as IpcMainInvokeEvent;

  it("trusts a message from the app's own page", () => {
    setAppEntryUrl(PROD_WIN);
    expect(isFromApp(eventFrom(`${PROD_WIN}#/settings`))).toBe(true);
  });

  it("refuses a message from any other page, or from a frame that's gone", () => {
    setAppEntryUrl(PROD_WIN);
    expect(isFromApp(eventFrom("https://evil.example/"))).toBe(false);
    expect(isFromApp(eventFrom("file:///C:/Users/me/Desktop/evil.html"))).toBe(false);
    expect(isFromApp(eventFrom(null))).toBe(false);
  });
});
