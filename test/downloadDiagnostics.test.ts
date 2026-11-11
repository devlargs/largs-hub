import { describe, expect, it } from "vitest";
import {
  formatDownloadLog,
  formatHiddenPopupLog,
  formatPopupRequestLog,
  redactUrlForLog,
} from "../electron/downloadDiagnostics";

describe("redactUrlForLog", () => {
  it("keeps origin and path but drops query values", () => {
    expect(
      redactUrlForLog("https://video.xx.fbcdn.net/v/t42/clip.mp4?_nc_cat=1&oh=secret&oe=67AB"),
    ).toBe("https://video.xx.fbcdn.net/v/t42/clip.mp4?[_nc_cat,oh,oe]");
  });

  it("keeps the value of Facebook's dl download flag", () => {
    expect(redactUrlForLog("https://scontent.fbcdn.net/a.mp4?dl=1&oh=secret")).toBe(
      "https://scontent.fbcdn.net/a.mp4?[dl=1,oh]",
    );
  });

  it("describes blob: URLs by the page origin that made them", () => {
    expect(redactUrlForLog("blob:https://www.messenger.com/1b2c-3d4e")).toBe(
      "blob:https://www.messenger.com/1b2c-3d4e",
    );
  });

  it("never prints data: payloads or other schemes in full", () => {
    expect(redactUrlForLog("data:video/mp4;base64,AAAA")).toBe("data:video/mp4…");
    expect(redactUrlForLog("file:///Users/me/secret.txt")).toBe("file:…");
  });

  it("shortens long paths and copes with empty or bad input", () => {
    const long = `https://example.com/${"a".repeat(200)}`;
    expect(redactUrlForLog(long)).toBe(`https://example.com/${"a".repeat(79)}…`);
    expect(redactUrlForLog("")).toBe("(none)");
    expect(redactUrlForLog("not a url")).toBe("(unparseable url)");
  });
});

describe("log lines", () => {
  it("formats a download with its source, chain and type", () => {
    expect(
      formatDownloadLog({
        partition: "persist:service-abc",
        source: "popup (hidden)",
        webContentsId: 7,
        pageUrl: "about:blank",
        urlChain: ["https://l.facebook.com/x?u=secret", "https://video.fbcdn.net/c.mp4?oh=s"],
        mimeType: "",
        filename: "c.mp4",
        userGesture: false,
        totalBytes: 1024,
      }),
    ).toBe(
      "[download] persist:service-abc from popup (hidden) #7 | page=about:… | " +
        "chain=https://l.facebook.com/x?[u] -> https://video.fbcdn.net/c.mp4?[oh] | " +
        "mime=(none) | file=c.mp4 | gesture=false | bytes=1024",
    );
  });

  it("formats popup requests and hidden-popup navigations", () => {
    expect(formatPopupRequestLog("p", 3, "https://www.messenger.com/t/1?x=1", "new-window")).toBe(
      "[popup] p #3 asked for new-window: https://www.messenger.com/t/1?[x]",
    );
    expect(
      formatHiddenPopupLog("p", 4, "blob:https://www.messenger.com/u", "ignored, stays hidden"),
    ).toBe(
      "[popup] p hidden popup #4 went to blob:https://www.messenger.com/u -> ignored, stays hidden",
    );
  });
});
