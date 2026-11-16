import { describe, expect, it } from "vitest";
import { buildFilename, buildTitle, isEpisodeTitleShortenedInFilename } from "../src/domain/naming";
import { buildTags } from "../src/domain/tags";
import type { EpisodeDraft } from "../src/domain/types";

const draft = (overrides: Partial<EpisodeDraft> = {}): EpisodeDraft => ({
  show: "Nice Show",
  episode: 23,
  episodeTitle: "Christmas Special",
  contributors: ["DJ Mike", "DJ Pete"],
  broadcastDate: "2012-12-24",
  ...overrides,
});

describe("buildTitle", () => {
  it("joins all parts", () => {
    expect(buildTitle(draft())).toBe("Nice Show - 23 - Christmas Special - DJ Mike, DJ Pete - 24.12.2012");
  });

  it("skips empty parts", () => {
    const quick = draft({ show: "Quick", episode: 7, episodeTitle: "", contributors: ["DJ B"], broadcastDate: "2002-02-02" });
    expect(buildTitle(quick)).toBe("Quick - 7 - DJ B - 02.02.2002");
  });

  it("keeps episode zero", () => {
    expect(buildTitle(draft({ episode: 0 }))).toContain(" - 0 - ");
  });

  it("works with only show and date", () => {
    expect(buildTitle(draft({ episode: null, episodeTitle: "", contributors: [] }))).toBe("Nice Show - 24.12.2012");
  });
});

describe("buildFilename", () => {
  it("replaces forbidden characters", () => {
    expect(buildFilename(draft({ show: '1H w/ DJ Mike: "Live"?' }))).toMatch(/^1H w_ DJ Mike_ _Live__ - 23/);
  });

  it("shortens only the episode title to fit 100 characters", () => {
    const long = draft({ episodeTitle: "x".repeat(200) });
    const name = buildFilename(long);
    expect(name.length).toBe(100 + ".mp3".length);
    expect(name).toContain("…");
    expect(name.endsWith("DJ Mike, DJ Pete - 24.12.2012.mp3")).toBe(true);
    expect(isEpisodeTitleShortenedInFilename(long)).toBe(true);
  });

  it("drops the episode title when no room is left", () => {
    const crowded = draft({ show: "S".repeat(95), episodeTitle: "Title" });
    expect(buildFilename(crowded)).not.toContain("Title");
  });

  it("does not shorten short titles", () => {
    expect(isEpisodeTitleShortenedInFilename(draft())).toBe(false);
  });
});

describe("buildTags", () => {
  it("maps fields to tags", () => {
    expect(buildTags(draft())).toEqual({
      title: "Nice Show - 23 - Christmas Special - DJ Mike, DJ Pete - 24.12.2012",
      artist: "DJ Mike, DJ Pete",
      album: "Nice Show",
      trackNumber: 23,
      composer: "24.12.2012",
    });
  });
});
