import type { ShowProfile } from "./profile";

const BACKUP_VERSION = 1;

interface StoredShow extends Omit<ShowProfile, "primaryCover"> {
  primaryCover: string | null;
}

export class BackupFormatError extends Error {}

export async function serializeBackup(profiles: ShowProfile[]): Promise<string> {
  const shows = await Promise.all(profiles.map(toStoredShow));
  return JSON.stringify({ version: BACKUP_VERSION, shows }, null, 2);
}

export async function parseBackup(text: string): Promise<ShowProfile[]> {
  const parsed = safeParse(text);
  if (parsed?.version !== BACKUP_VERSION || !Array.isArray(parsed.shows)) {
    throw new BackupFormatError("This is not a LibreTime Tagger backup file.");
  }
  return Promise.all(parsed.shows.map(fromStoredShow));
}

async function toStoredShow(profile: ShowProfile): Promise<StoredShow> {
  return { ...profile, primaryCover: profile.primaryCover && (await toDataUrl(profile.primaryCover)) };
}

async function fromStoredShow(stored: StoredShow): Promise<ShowProfile> {
  if (typeof stored?.name !== "string" || stored.name.trim() === "") {
    throw new BackupFormatError("The backup contains a show without a name.");
  }
  return {
    name: stored.name,
    lastEpisode: Number.isInteger(stored.lastEpisode) ? stored.lastEpisode : null,
    primaryContributors: Array.isArray(stored.primaryContributors) ? stored.primaryContributors.map(String) : [],
    primaryCover: stored.primaryCover ? await fromDataUrl(stored.primaryCover) : null,
  };
}

function safeParse(text: string): { version?: number; shows?: StoredShow[] } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function fromDataUrl(dataUrl: string): Promise<Blob> {
  const [header = "", payload = ""] = dataUrl.split(",");
  const type = /^data:([^;]+);base64$/.exec(header)?.[1];
  if (!type) throw new BackupFormatError("The backup contains a cover image that cannot be read.");
  return new Blob([Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))], { type });
}
