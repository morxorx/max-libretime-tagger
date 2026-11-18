import type { LoudnessTarget, NormalizationType } from "../domain/loudness";
import { ConversionError } from "./errors";
import { buildEncodeArgs, buildMeasureArgs, resolveOutputRate, type NormalizationPlan } from "./ffmpegArgs";
import { parseMeasurement, parseNormalizationType, parseSampleRate } from "./loudnormReport";
import { progressOf, type ProcessingProgress } from "./progress";

export interface MediaRunner {
  mount(file: File): Promise<void>;
  run(args: string[], onProgress: (ratio: number) => void): Promise<string>;
  readOutput(): Promise<Uint8Array>;
  terminate(): void;
}

export interface ProcessedAudio {
  bytes: Uint8Array;
  normalizationType: NormalizationType | null;
}

export const MAX_INPUT_BYTES = 2 * 1024 ** 3;

export async function processAudio(
  runner: MediaRunner,
  file: File,
  target: LoudnessTarget | null,
  report: (progress: ProcessingProgress) => void,
): Promise<ProcessedAudio> {
  if (file.size > MAX_INPUT_BYTES) throw new ConversionError("This file is larger than 2 GB, which is too big to convert in the browser.");
  try {
    await runner.mount(file);
    const plan = target ? await planNormalization(runner, target, report) : null;
    const log = await runner.run(buildEncodeArgs(plan), (ratio) => report(progressOf("encoding", ratio, plan !== null)));
    return { bytes: await runner.readOutput(), normalizationType: plan ? parseNormalizationType(log) : null };
  } finally {
    runner.terminate();
  }
}

async function planNormalization(
  runner: MediaRunner,
  target: LoudnessTarget,
  report: (progress: ProcessingProgress) => void,
): Promise<NormalizationPlan> {
  const log = await runner.run(buildMeasureArgs(target), (ratio) => report(progressOf("measuring", ratio, true)));
  return { target, measurement: parseMeasurement(log), sampleRate: resolveOutputRate(parseSampleRate(log)) };
}
