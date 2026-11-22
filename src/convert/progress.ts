export type ProcessingPass = "detecting" | "measuring" | "refining" | "encoding";
export type ProcessingPhase = ProcessingPass | "normalizing";

export interface ProcessingProgress {
  phase: ProcessingPhase;
  fraction: number;
}

const PASS_ORDER: readonly ProcessingPass[] = ["detecting", "measuring", "refining", "encoding"];
// Rough share of the time each pass takes on a long recording. Refining is the slow loudnorm measurement, only needed for peaky material.
const PASS_WEIGHTS: Record<ProcessingPass, number> = { detecting: 0.1, measuring: 0.3, refining: 1, encoding: 0.6 };

export function plannedPasses(options: { trimSilence: boolean; normalize: boolean }): ProcessingPass[] {
  const wanted = { detecting: options.trimSilence, measuring: options.normalize, refining: false, encoding: true };
  return PASS_ORDER.filter((pass) => wanted[pass]);
}

export function progressOf(phase: ProcessingPhase, ratio: number, planned: ProcessingPass[]): ProcessingProgress {
  const pass = phase === "normalizing" ? "encoding" : phase;
  const done = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  const before = planned.slice(0, planned.indexOf(pass));
  const finished = before.reduce((sum, earlier) => sum + PASS_WEIGHTS[earlier], 0);
  const total = planned.reduce((sum, included) => sum + PASS_WEIGHTS[included], 0);
  return { phase, fraction: (finished + PASS_WEIGHTS[pass] * done) / total };
}
