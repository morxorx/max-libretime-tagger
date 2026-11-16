export interface ShowProfile {
  name: string;
  lastEpisode: number | null;
  primaryContributors: string[];
  primaryCover: Blob | null;
}

export function newProfile(name: string): ShowProfile {
  return { name, lastEpisode: null, primaryContributors: [], primaryCover: null };
}

export function suggestedEpisode(profile: ShowProfile): number | null {
  return profile.lastEpisode === null ? null : profile.lastEpisode + 1;
}
