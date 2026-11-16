export interface EpisodeDraft {
  show: string;
  episode: number | null;
  episodeTitle: string;
  contributors: string[];
  broadcastDate: string;
}

export interface Mp3Tags {
  title: string;
  artist: string;
  album: string;
  trackNumber: number | null;
  composer: string;
}
