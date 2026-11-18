export type LoudnessTargetId = "ebu-r128" | "streaming";
export type NormalizationType = "linear" | "dynamic";

export interface LoudnessTarget {
  id: LoudnessTargetId;
  integratedLufs: number;
  description: string;
}

export interface AppliedLoudness {
  target: LoudnessTarget;
  type: NormalizationType;
}

export const LOUDNESS_TARGETS: readonly LoudnessTarget[] = [
  { id: "ebu-r128", integratedLufs: -23, description: "EBU R128, broadcast" },
  { id: "streaming", integratedLufs: -14, description: "streaming" },
];

// Below -1 dBTP on purpose: MP3 encoding overshoots the peaks of the decoded signal.
export const TRUE_PEAK_CEILING_DBTP = -1.5;

// Wide enough that ordinary speech and music stay on loudnorm's gentler linear path.
export const LOUDNESS_RANGE_LU = 11;
