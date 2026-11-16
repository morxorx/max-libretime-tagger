import type { AudioFile, TagLib } from "taglib-wasm";
import { requireMp3 } from "./mp3Guard";

export async function stripAllTags(taglib: TagLib, mp3: Uint8Array): Promise<Uint8Array> {
  const file = await taglib.open(mp3);
  try {
    requireMp3(file);
    removeEveryId3v2Frame(file);
    file.removePictures();
    file.setProperties({});
    clearBasicTags(file);
    file.save();
    return file.getFileBuffer().slice();
  } finally {
    file.dispose();
  }
}

function removeEveryId3v2Frame(file: AudioFile): void {
  const frameIds = new Set(file.getId3v2Frames().map((frame) => frame.id));
  for (const id of frameIds) file.removeId3v2Frames(id);
}

function clearBasicTags(file: AudioFile): void {
  const tag = file.tag();
  tag.setTitle("");
  tag.setArtist("");
  tag.setAlbum("");
  tag.setComment("");
  tag.setGenre("");
  tag.setYear(0);
  tag.setTrack(0);
}
