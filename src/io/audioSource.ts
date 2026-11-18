export interface AudioSource {
  file: File;
  handle: FileSystemFileHandle | null;
}

export const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".aac", ".ogg", ".oga", ".opus"];

const AUDIO_PICKER_OPTIONS = {
  types: [{ description: "Audio", accept: { "audio/*": SUPPORTED_EXTENSIONS } }],
  excludeAcceptAllOption: true,
};

export function isMp3(file: File): boolean {
  return file.name.toLowerCase().endsWith(".mp3");
}

export function isSupportedAudio(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function sourceFromFile(file: File): AudioSource {
  return { file, handle: null };
}

export async function pickAudioWithHandle(): Promise<AudioSource | null> {
  if (!window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker(AUDIO_PICKER_OPTIONS);
    return handle ? { file: await handle.getFile(), handle } : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export async function sourceFromDrop(item: DataTransferItem): Promise<AudioSource | null> {
  const handle = await item.getAsFileSystemHandle?.();
  if (handle?.kind === "file") {
    const fileHandle = handle as FileSystemFileHandle;
    return { file: await fileHandle.getFile(), handle: fileHandle };
  }
  const file = item.getAsFile();
  return file ? sourceFromFile(file) : null;
}

export async function readBytes(source: AudioSource): Promise<Uint8Array> {
  const file = source.handle ? await source.handle.getFile() : source.file;
  return new Uint8Array(await file.arrayBuffer());
}
