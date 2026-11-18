import type { AppliedLoudness } from "./loudness";

export interface SaveFacts {
  converted: boolean;
  loudness: AppliedLoudness | null;
  replacesOriginal: boolean;
  nameWasShortened: boolean;
}

const DYNAMIC_NOTE =
  "This recording was too dynamic for a plain volume change at this target, so its loudness was shaped dynamically. Listen to the result before publishing.";

export function buildReviewNotes(facts: SaveFacts): string[] {
  return [
    "All other tags in the file are removed.",
    ...describeAudio(facts),
    describeOriginal(facts),
    ...(facts.nameWasShortened
      ? ["The episode title is shortened in the file name to stay within 100 characters. The Title tag keeps it in full."]
      : []),
  ];
}

function describeAudio({ converted, loudness }: SaveFacts): string[] {
  const notes: string[] = [];
  if (converted) notes.push("The audio was converted to MP3 (320 kbps CBR).");
  else if (loudness) notes.push("The MP3 was re-encoded as 320 kbps CBR to change its loudness.");
  if (loudness) notes.push(`Loudness was normalized to ${loudness.target.integratedLufs} LUFS (${loudness.target.description}).`);
  if (loudness?.type === "dynamic") notes.push(DYNAMIC_NOTE);
  return notes;
}

function describeOriginal({ converted, replacesOriginal }: SaveFacts): string {
  if (replacesOriginal) {
    return "Saving changes the original file and renames it. If a file with the new name is in the same folder, check it first.";
  }
  return converted
    ? "The original is not an MP3, so it stays unchanged and a tagged MP3 is downloaded."
    : "Your browser cannot rename the original. A tagged copy is downloaded and the original stays unchanged.";
}
