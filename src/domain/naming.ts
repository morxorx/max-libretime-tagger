import type { EpisodeDraft } from "./types";

const SEPARATOR = " - ";
const MAX_FILENAME_STEM_LENGTH = 100;
const ELLIPSIS = "…";
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function formatBroadcastDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

export function buildTitle(draft: EpisodeDraft): string {
  return [
    draft.show,
    draft.episode === null ? "" : String(draft.episode),
    draft.episodeTitle,
    draft.contributors.join(", "),
    formatBroadcastDate(draft.broadcastDate),
  ]
    .filter((part) => part !== "")
    .join(SEPARATOR);
}

export function buildFilename(draft: EpisodeDraft): string {
  const fitted = { ...draft, episodeTitle: fitEpisodeTitle(draft) };
  return `${sanitizeFilename(buildTitle(fitted))}.mp3`;
}

export function isEpisodeTitleShortenedInFilename(draft: EpisodeDraft): boolean {
  return fitEpisodeTitle(draft) !== draft.episodeTitle;
}

function fitEpisodeTitle(draft: EpisodeDraft): string {
  if (!draft.episodeTitle || buildTitle(draft).length <= MAX_FILENAME_STEM_LENGTH) {
    return draft.episodeTitle;
  }
  const withoutTitle = buildTitle({ ...draft, episodeTitle: "" });
  const room = MAX_FILENAME_STEM_LENGTH - withoutTitle.length - SEPARATOR.length;
  if (room <= ELLIPSIS.length) return "";
  return draft.episodeTitle.slice(0, room - ELLIPSIS.length).trimEnd() + ELLIPSIS;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(FORBIDDEN_FILENAME_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}
