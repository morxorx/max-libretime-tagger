import { ConversionError } from "./errors";

export interface LoudnessReading {
  integrated: number;
  truePeak: number;
}

// ebur128 reports -70 LUFS when nothing rises above the absolute gate, which is what silence looks like.
const ABSOLUTE_GATE_LUFS = -70;
const INTEGRATED_PATTERN = /\n\s+I:\s+(\S+) LUFS/;
const TRUE_PEAK_PATTERN = /\n\s+Peak:\s+(\S+) dBFS/;

export function parseReading(log: string): LoudnessReading {
  const start = log.lastIndexOf("Summary:");
  const summary = start === -1 ? "" : log.slice(start);
  const integrated = Number(INTEGRATED_PATTERN.exec(summary)?.[1]);
  const truePeak = Number(TRUE_PEAK_PATTERN.exec(summary)?.[1]);
  if (!Number.isFinite(integrated) || !Number.isFinite(truePeak)) {
    throw new ConversionError("The loudness of this audio could not be measured. It may be silent.");
  }
  if (integrated <= ABSOLUTE_GATE_LUFS) throw new ConversionError("This audio is silent, so its loudness cannot be measured.");
  return { integrated, truePeak };
}
