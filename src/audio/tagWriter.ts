import type { AudioFile, TagLib } from "taglib-wasm";
import type { Mp3Tags } from "../domain/types";
import { TagWriteError } from "./mp3Guard";
import { stripAllTags } from "./tagStripper";

const COVER_DESCRIPTION = "Cover";
const ID3V1_FOOTER_LENGTH = 128;
const ID3V1_MARKER = "TAG";

export { TagWriteError };

export async function writeTags(
  taglib: TagLib,
  mp3: Uint8Array,
  tags: Mp3Tags,
  coverJpeg: Uint8Array,
): Promise<Uint8Array> {
  const file = await taglib.open(await stripAllTags(taglib, mp3));
  try {
    applyBasicTags(file, tags);
    applyCover(file, coverJpeg);
    if (!file.save()) throw new TagWriteError("The tags could not be saved.");
    return withoutId3v1Footer(file.getFileBuffer().slice());
  } finally {
    file.dispose();
  }
}

function applyBasicTags(file: AudioFile, tags: Mp3Tags): void {
  const tag = file.tag();
  tag.setTitle(tags.title);
  tag.setArtist(tags.artist);
  tag.setAlbum(tags.album);
  tag.setTrack(tags.trackNumber ?? 0);
  file.setProperty("COMPOSER", tags.composer);
}

function applyCover(file: AudioFile, coverJpeg: Uint8Array): void {
  file.setPictures([
    { mimeType: "image/jpeg", data: coverJpeg, type: "FrontCover", description: COVER_DESCRIPTION },
  ]);
}

function withoutId3v1Footer(bytes: Uint8Array): Uint8Array {
  const marker = new TextDecoder("latin1").decode(bytes.subarray(-ID3V1_FOOTER_LENGTH, -ID3V1_FOOTER_LENGTH + ID3V1_MARKER.length));
  return marker === ID3V1_MARKER ? bytes.slice(0, -ID3V1_FOOTER_LENGTH) : bytes;
}
