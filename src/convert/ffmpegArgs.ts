import { LOUDNESS_RANGE_LU, TRUE_PEAK_CEILING_DBTP, type LoudnessTarget } from "../domain/loudness";
import type { LoudnessMeasurement } from "./loudnormReport";

export const MOUNT_DIR = "/input";
export const SOURCE_NAME = "source";
export const OUTPUT_PATH = "output.mp3";

const INPUT_PATH = `${MOUNT_DIR}/${SOURCE_NAME}`;
const MP3_NATIVE_RATES = [32000, 44100, 48000];
const CD_RATE = 44100;
const VIDEO_RATE = 48000;
const VIDEO_RATE_FAMILY_STEP = 4000;

export interface NormalizationPlan {
  target: LoudnessTarget;
  measurement: LoudnessMeasurement;
  sampleRate: number;
}

export function buildMeasureArgs(target: LoudnessTarget): string[] {
  return [...readFirstAudioStream(), "-af", `${loudnormTarget(target)}:print_format=json`, "-f", "null", "-"];
}

export function buildEncodeArgs(plan: NormalizationPlan | null): string[] {
  return [
    ...readFirstAudioStream(),
    "-map_metadata", "-1",
    ...(plan ? ["-af", loudnormApply(plan), "-ar", String(plan.sampleRate)] : []),
    "-c:a", "libmp3lame",
    "-b:a", "320k",
    OUTPUT_PATH,
  ];
}

// loudnorm works at 192 kHz internally, so the rate must be pinned or it leaks into the output.
export function resolveOutputRate(sourceRate: number | undefined): number {
  if (sourceRate === undefined) return CD_RATE;
  if (MP3_NATIVE_RATES.includes(sourceRate)) return sourceRate;
  return sourceRate % VIDEO_RATE_FAMILY_STEP === 0 ? VIDEO_RATE : CD_RATE;
}

function readFirstAudioStream(): string[] {
  return ["-hide_banner", "-y", "-i", INPUT_PATH, "-map", "0:a:0"];
}

function loudnormTarget(target: LoudnessTarget): string {
  return `loudnorm=I=${target.integratedLufs}:TP=${TRUE_PEAK_CEILING_DBTP}:LRA=${LOUDNESS_RANGE_LU}`;
}

function loudnormApply({ target, measurement }: NormalizationPlan): string {
  const measured = [
    `measured_I=${measurement.integrated}`,
    `measured_TP=${measurement.truePeak}`,
    `measured_LRA=${measurement.range}`,
    `measured_thresh=${measurement.threshold}`,
    `offset=${measurement.offset}`,
  ];
  return [loudnormTarget(target), ...measured, "linear=true", "print_format=json"].join(":");
}
