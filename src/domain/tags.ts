import { buildTitle, formatBroadcastDate } from "./naming";
import type { EpisodeDraft, Mp3Tags } from "./types";

export function buildTags(draft: EpisodeDraft): Mp3Tags {
  return {
    title: buildTitle(draft),
    artist: draft.contributors.join(", "),
    album: draft.show,
    trackNumber: draft.episode,
    composer: formatBroadcastDate(draft.broadcastDate),
  };
}
