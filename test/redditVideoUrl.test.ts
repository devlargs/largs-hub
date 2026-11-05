import { describe, expect, it } from "vitest";
import { asRedditVideoProbe, isRedditPage, pickRedditVideoUrl } from "../electron/redditVideoUrl";

const mp4 = (res: number) =>
  `https://packaged-media.redd.it/abc123/pb/m2-res_${res}p.mp4?m=DASHPlaylist.mpd&v=1&e=1&s=sig`;

const packaged = (...heights: number[]) =>
  JSON.stringify({
    playbackMp4s: {
      duration: 26,
      permutations: heights.map((h) => ({
        source: { url: mp4(h), dimensions: { width: Math.round((h * 9) / 16), height: h } },
      })),
    },
  });

describe("isRedditPage", () => {
  it.each([
    ["https://www.reddit.com/r/videos/", true],
    ["https://reddit.com", true],
    ["https://old.reddit.com/r/x", true],
    ["https://notreddit.com", false],
    ["https://reddit.com.evil.example/", false],
    ["file:///reddit.com", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isRedditPage(url)).toBe(expected);
  });
});

describe("pickRedditVideoUrl", () => {
  it("takes the tallest MP4 from packaged-media-json", () => {
    const url = pickRedditVideoUrl({
      attributes: { "packaged-media-json": packaged(240, 720, 480) },
      videoSrc: "blob:https://www.reddit.com/1234",
    });
    expect(url).toBe(mp4(720));
  });

  it("ignores links that aren't https on redd.it", () => {
    const json = JSON.stringify({
      playbackMp4s: {
        permutations: [
          { source: { url: "https://evil.example/x.mp4", dimensions: { height: 1080 } } },
          { source: { url: mp4(360), dimensions: { height: 360 } } },
        ],
      },
    });
    expect(pickRedditVideoUrl({ attributes: { "packaged-media-json": json }, videoSrc: "" })).toBe(
      mp4(360),
    );
  });

  it("falls back to packaged links anywhere in the attributes when the JSON shape changes", () => {
    const other = `{"mp4s":["${mp4(480).replace(/&/g, "\\u0026")}","${mp4(1080).replace(/&/g, "\\u0026")}"]}`;
    expect(
      pickRedditVideoUrl({
        attributes: { "packaged-media-json": "{}", "media-json": other },
        videoSrc: "",
      }),
    ).toBe(mp4(1080));
  });

  it("survives malformed JSON", () => {
    expect(
      pickRedditVideoUrl({ attributes: { "packaged-media-json": "{oops" }, videoSrc: "" }),
    ).toBeNull();
  });

  it("uses a plain redd.it video file as the source", () => {
    const src = "https://preview.redd.it/clip.gif?format=mp4&s=abc";
    expect(pickRedditVideoUrl({ attributes: {}, videoSrc: src })).toBe(src);
  });

  it.each([
    "blob:https://www.reddit.com/5678",
    "https://v.redd.it/abc/HLSPlaylist.m3u8?a=1",
    "https://v.redd.it/abc/DASHPlaylist.mpd",
    "https://evil.example/video.mp4",
    "",
  ])("has nothing to download for a stream or foreign source: %s", (src) => {
    expect(pickRedditVideoUrl({ attributes: {}, videoSrc: src })).toBeNull();
  });
});

describe("asRedditVideoProbe", () => {
  it("rejects non-objects and missing attributes", () => {
    expect(asRedditVideoProbe(null)).toBeNull();
    expect(asRedditVideoProbe("x")).toBeNull();
    expect(asRedditVideoProbe({ videoSrc: "x" })).toBeNull();
  });

  it("keeps only string attributes and defaults the source", () => {
    expect(asRedditVideoProbe({ attributes: { a: "1", b: 2 } })).toEqual({
      attributes: { a: "1" },
      videoSrc: "",
    });
  });
});
