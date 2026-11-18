export type ProcessingPhase = "measuring" | "encoding";

export interface ProcessingProgress {
  phase: ProcessingPhase;
  fraction: number;
}

const MEASURE_SHARE = 0.5;

export function progressOf(phase: ProcessingPhase, ratio: number, normalizing: boolean): ProcessingProgress {
  const done = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  if (phase === "measuring") return { phase, fraction: done * MEASURE_SHARE };
  return { phase, fraction: normalizing ? MEASURE_SHARE + done * (1 - MEASURE_SHARE) : done };
}
