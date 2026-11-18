import type { NormalizationType } from "../domain/loudness";
import { ConversionError } from "./errors";

export interface LoudnessMeasurement {
  integrated: number;
  truePeak: number;
  range: number;
  threshold: number;
  offset: number;
}

const REPORT_PATTERN = /\{[^{}]*"input_i"[^{}]*\}/;
const NORMALIZATION_TYPE_PATTERN = /"normalization_type"\s*:\s*"(\w+)"/;
// The first audio stream line is the input; the output stream is listed after it.
const SOURCE_RATE_PATTERN = /Stream #0:\d+[^\n]*?Audio:[^\n]*?,\s*(\d+) Hz/;

export function parseMeasurement(log: string): LoudnessMeasurement {
  const report = readReport(log);
  const measurement = {
    integrated: Number(report.input_i),
    truePeak: Number(report.input_tp),
    range: Number(report.input_lra),
    threshold: Number(report.input_thresh),
    offset: Number(report.target_offset),
  };
  if (!Object.values(measurement).every(Number.isFinite)) {
    throw new ConversionError("The loudness of this audio could not be measured. It may be silent.");
  }
  return measurement;
}

// Unknown counts as dynamic: the warning shown for it is the safe side of a wrong guess.
export function parseNormalizationType(log: string): NormalizationType {
  return NORMALIZATION_TYPE_PATTERN.exec(log)?.[1] === "linear" ? "linear" : "dynamic";
}

export function parseSampleRate(log: string): number | undefined {
  const rate = SOURCE_RATE_PATTERN.exec(log)?.[1];
  return rate === undefined ? undefined : Number(rate);
}

function readReport(log: string): Record<string, string> {
  const match = REPORT_PATTERN.exec(log);
  if (!match) throw new ConversionError("The loudness of this audio could not be measured.");
  return JSON.parse(match[0]);
}
