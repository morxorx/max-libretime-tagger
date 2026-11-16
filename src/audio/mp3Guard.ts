import type { AudioFile } from "taglib-wasm";

export class TagWriteError extends Error {}

export function requireMp3(file: AudioFile): void {
  if (!file.isValid() || file.getFormat() !== "MP3") {
    throw new TagWriteError("This file is not a readable MP3.");
  }
}
