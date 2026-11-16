import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { TagLib } from "taglib-wasm";
import { writeTags } from "../src/audio/tagWriter";
import type { Mp3Tags } from "../src/domain/types";

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const wasm = new Uint8Array(readFileSync("node_modules/taglib-wasm/dist/taglib-web.wasm"));
const cover = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const containsText = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(text);

const tags: Mp3Tags = {
  title: "Quick - 7 - DJ B - 02.02.2002",
  artist: "DJ B",
  album: "Quick",
  trackNumber: 7,
  composer: "02.02.2002",
};

let taglib: TagLib;
beforeAll(async () => {
  taglib = await TagLib.initialize({ wasmBinary: wasm });
});

async function inspect(bytes: Uint8Array) {
  const file = await taglib.open(bytes);
  const result = {
    format: file.getFormat(),
    title: file.tag().title,
    artist: file.tag().artist,
    album: file.tag().album,
    track: file.tag().track,
    composer: file.getProperty("COMPOSER"),
    pictures: file.getPictures(),
    frameIds: [...new Set(file.getId3v2Frames().map((frame) => frame.id))].sort(),
  };
  file.dispose();
  return result;
}

describe("writeTags", () => {
  it("writes the standard tags and the cover", async () => {
    const result = await inspect(await writeTags(taglib, fixture("silence.mp3"), tags, cover));
    expect(result).toMatchObject({ format: "MP3", title: tags.title, artist: "DJ B", album: "Quick", track: 7, composer: "02.02.2002" });
    expect(result.pictures).toHaveLength(1);
  });

  it("leaves the track empty without an episode", async () => {
    const result = await inspect(await writeTags(taglib, fixture("silence.mp3"), { ...tags, trackNumber: null }, cover));
    expect(result.track).toBe(0);
  });

  it("rejects files that are not MP3", async () => {
    await expect(writeTags(taglib, new Uint8Array([1, 2, 3, 4]), tags, cover)).rejects.toThrow();
  });
});

describe("writeTags on a file full of old tags", () => {
  const dirty = fixture("dirty.mp3");

  it("keeps only the five new text tags and the cover", async () => {
    const result = await inspect(await writeTags(taglib, dirty, tags, cover));
    expect(result.frameIds).toEqual(["APIC", "TALB", "TCOM", "TIT2", "TPE1", "TRCK"]);
    expect(result.pictures).toHaveLength(1);
    expect(result.pictures[0]?.data).toEqual(cover);
  });

  it("leaves no trace of old comments, genres, lyrics, ID3v1 or APE tags", async () => {
    const output = await writeTags(taglib, dirty, tags, cover);
    for (const leftover of ["Converted by SomeTool", "Podcast", "lyrics", "Old title", "Old artist", "ape comment", "http://old", "APETAGEX", "Encoder"]) {
      expect(containsText(output, leftover), leftover).toBe(false);
    }
    expect(Buffer.from(output.slice(-128, -125)).toString("latin1")).not.toBe("TAG");
  });

  it("is stable when run twice", async () => {
    const once = await writeTags(taglib, dirty, tags, cover);
    expect(await inspect(await writeTags(taglib, once, tags, cover))).toMatchObject({ frameIds: ["APIC", "TALB", "TCOM", "TIT2", "TPE1", "TRCK"] });
  });
});
