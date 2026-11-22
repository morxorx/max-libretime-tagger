import type { AudioInfo } from "../domain/audioDescription";
import { TRUE_PEAK_CEILING_DBTP, isAtTarget, type LoudnessResult, type LoudnessTarget } from "../domain/loudness";
import { NO_TRIM, planTrim, type TrimOutcome, type TrimPlan } from "../domain/trim";
import { ConversionError } from "./errors";
import { buildDetectArgs, buildEncodeArgs, buildLoudnormMeasureArgs, buildMeasureArgs, resolveOutputRate, type NormalizationPlan } from "./ffmpegArgs";
import { parseReading, type LoudnessReading } from "./ebur128Report";
import { parseMeasurement, parseNormalizationType, parseOutputLufs } from "./loudnormReport";
import { parseAudioInfo, parseDuration, parseSilences } from "./mediaLog";
import { plannedPasses, progressOf, type ProcessingPass, type ProcessingPhase, type ProcessingProgress } from "./progress";

export interface MediaRunner {
  mount(file: File): Promise<void>;
  run(args: string[], onProgress: (ratio: number) => void): Promise<string>;
  readOutput(): Promise<Uint8Array>;
  terminate(): void;
}

export interface ProcessingOptions {
  target: LoudnessTarget | null;
  trimSilence: boolean;
  /** An MP3 source that needs no change can be used as it is instead of being re-encoded. */
  canKeepOriginal: boolean;
}

export interface ProcessedAudio {
  /** Null means the original MP3 is used untouched. */
  bytes: Uint8Array | null;
  info: AudioInfo | null;
  loudness: LoudnessResult | null;
  trim: TrimOutcome | null;
}

export const MAX_INPUT_BYTES = 2 * 1024 ** 3;

type Report = (progress: ProcessingProgress) => void;

export async function processAudio(runner: MediaRunner, file: File, options: ProcessingOptions, report: Report): Promise<ProcessedAudio> {
  if (file.size > MAX_INPUT_BYTES) throw new ConversionError("This file is larger than 2 GB, which is too big to convert in the browser.");
  const session = new ProcessingSession(runner, options, report);
  try {
    await runner.mount(file);
    return await session.run();
  } finally {
    runner.terminate();
  }
}

class ProcessingSession {
  private readonly passes: ProcessingPass[];
  private info: AudioInfo | null = null;
  private furthest = 0;

  constructor(
    private readonly runner: MediaRunner,
    private readonly options: ProcessingOptions,
    private readonly report: Report,
  ) {
    this.passes = plannedPasses({ trimSilence: options.trimSilence, normalize: options.target !== null });
  }

  async run(): Promise<ProcessedAudio> {
    const trim = this.options.trimSilence ? await this.detectSilence() : NO_TRIM;
    const analysis = this.options.target ? await this.analyze(this.options.target, trim) : null;
    const normalization = analysis?.plan ?? null;
    const outcome = this.options.trimSilence ? trim.outcome : null;

    if (this.options.canKeepOriginal && trim.window === null && normalization === null) {
      this.announce({ phase: "encoding", fraction: 1 });
      return { bytes: null, info: this.info, loudness: analysis?.unchanged ?? null, trim: outcome };
    }
    const log = await this.pass(normalization ? "normalizing" : "encoding", buildEncodeArgs({ trim: trim.window, normalization }));
    const loudness = normalization && analysis ? this.normalizedLoudness(normalization, analysis.reading, log) : (analysis?.unchanged ?? null);
    return { bytes: await this.runner.readOutput(), info: this.info, loudness, trim: outcome };
  }

  private async detectSilence(): Promise<TrimPlan> {
    const log = await this.pass("detecting", buildDetectArgs());
    const duration = parseDuration(log);
    return duration === undefined ? NO_TRIM : planTrim(duration, parseSilences(log, duration));
  }

  private async analyze(target: LoudnessTarget, trim: TrimPlan): Promise<Analysis> {
    const reading = parseReading(await this.pass("measuring", buildMeasureArgs(trim.window)));
    if (isAtTarget(target, reading.integrated, reading.truePeak)) {
      const lufs = reading.integrated;
      return { reading, plan: null, unchanged: { measuredLufs: lufs, measuredTruePeak: reading.truePeak, expectedLufs: lufs, type: "unchanged" } };
    }
    const gainDb = target.integratedLufs - reading.integrated;
    if (reading.truePeak + gainDb <= TRUE_PEAK_CEILING_DBTP) return { reading, plan: { kind: "gain", target, gainDb }, unchanged: null };
    return { reading, plan: await this.planLoudnorm(target, trim), unchanged: null };
  }

  private async planLoudnorm(target: LoudnessTarget, trim: TrimPlan): Promise<NormalizationPlan> {
    this.passes.splice(this.passes.indexOf("encoding"), 0, "refining");
    const measurement = parseMeasurement(await this.pass("refining", buildLoudnormMeasureArgs(target, trim.window)));
    return { kind: "loudnorm", target, measurement, sampleRate: resolveOutputRate(this.info?.sampleRateHz) };
  }

  private normalizedLoudness(plan: NormalizationPlan, reading: LoudnessReading, log: string): LoudnessResult {
    if (plan.kind === "gain") {
      return { measuredLufs: reading.integrated, measuredTruePeak: reading.truePeak, expectedLufs: plan.target.integratedLufs, type: "linear" };
    }
    return {
      measuredLufs: plan.measurement.integrated,
      measuredTruePeak: plan.measurement.truePeak,
      expectedLufs: parseOutputLufs(log) ?? plan.target.integratedLufs,
      type: parseNormalizationType(log),
    };
  }

  private async pass(phase: ProcessingPhase, args: string[]): Promise<string> {
    const log = await this.runner.run(args, (ratio) => this.announce(progressOf(phase, ratio, this.passes)));
    this.info ??= parseAudioInfo(log);
    return log;
  }

  // The bar only moves forward, even when a slower pass is added half way through.
  private announce(progress: ProcessingProgress): void {
    this.furthest = Math.max(this.furthest, progress.fraction);
    this.report({ phase: progress.phase, fraction: this.furthest });
  }
}

interface Analysis {
  reading: LoudnessReading;
  plan: NormalizationPlan | null;
  unchanged: LoudnessResult | null;
}
