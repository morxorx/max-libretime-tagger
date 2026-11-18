import { FfmpegRunner } from "../convert/ffmpegRunner";
import { ConversionError } from "../convert/errors";
import { processAudio, type MediaRunner } from "../convert/processAudio";
import type { ProcessingPhase, ProcessingProgress } from "../convert/progress";
import { LOUDNESS_TARGETS, type AppliedLoudness, type LoudnessTarget } from "../domain/loudness";
import { isMp3, type AudioSource } from "../io/audioSource";
import { byId, h } from "./dom";

export interface PreparedAudio {
  /** Null means the chosen MP3 is used untouched. */
  bytes: Uint8Array | null;
  converted: boolean;
  loudness: AppliedLoudness | null;
}

interface Handlers {
  onChange(): void;
  onCancel(): void;
}

type Preparation =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; audio: PreparedAudio };

const LOADING_MESSAGE = "Loading the converter…";
const FAILURE_MESSAGE = "The audio could not be prepared. Try another file.";

export class AudioPreparation {
  private source: AudioSource | null = null;
  private state: Preparation = { kind: "idle" };
  private runner: MediaRunner | null = null;
  private generation = 0;
  private shownPhase: ProcessingPhase | null = null;

  private readonly masthead = byId("masthead");
  private readonly bar = byId("audioProgress");
  private readonly normalize = byId<HTMLInputElement>("normalize");
  private readonly target = byId<HTMLSelectElement>("loudnessTarget");
  private readonly status = byId("audioStatus");
  private readonly cancel = byId<HTMLButtonElement>("audioCancel");
  private readonly error = byId("error-file");

  constructor(
    private readonly handlers: Handlers,
    private readonly createRunner: () => MediaRunner = () => new FfmpegRunner(),
  ) {
    this.target.replaceChildren(
      ...LOUDNESS_TARGETS.map((option) => h("option", { value: option.id, textContent: `${option.integratedLufs} LUFS (${option.description})` })),
    );
    this.normalize.addEventListener("change", () => this.onNormalizeToggled());
    this.target.addEventListener("change", () => this.start());
    this.cancel.addEventListener("click", () => this.handlers.onCancel());
  }

  get prepared(): PreparedAudio | null {
    return this.state.kind === "ready" ? this.state.audio : null;
  }

  isProcessing(): boolean {
    return this.state.kind === "processing";
  }

  notReadyMessage(): string {
    return this.state.kind === "failed" ? this.state.message : "Wait until the audio is ready.";
  }

  load(source: AudioSource | null): void {
    this.source = source;
    this.start();
  }

  private onNormalizeToggled(): void {
    this.target.disabled = !this.normalize.checked;
    this.start();
  }

  private selectedTarget(): LoudnessTarget | null {
    if (!this.normalize.checked) return null;
    return LOUDNESS_TARGETS.find((option) => option.id === this.target.value) ?? null;
  }

  private start(): void {
    this.abandonRun();
    const file = this.source?.file;
    if (!file) return this.settle({ kind: "idle" });
    const target = this.selectedTarget();
    const converted = !isMp3(file);
    if (converted || target) void this.process(file, target, converted);
    else this.settle({ kind: "ready", audio: { bytes: null, converted: false, loudness: null } });
  }

  private async process(file: File, target: LoudnessTarget | null, converted: boolean): Promise<void> {
    const generation = this.generation;
    const runner = this.createRunner();
    this.runner = runner;
    this.shownPhase = null;
    this.setProgress(0);
    this.settle({ kind: "processing" });
    try {
      const result = await processAudio(runner, file, target, (progress) => this.showProgress(generation, progress, target));
      const loudness = target && result.normalizationType ? { target, type: result.normalizationType } : null;
      this.finish(generation, { kind: "ready", audio: { bytes: result.bytes, converted, loudness } });
    } catch (failure) {
      if (!(failure instanceof ConversionError)) console.error("Audio processing failed.", failure);
      this.finish(generation, { kind: "failed", message: failure instanceof ConversionError ? failure.message : FAILURE_MESSAGE });
    }
  }

  private abandonRun(): void {
    this.generation += 1;
    this.runner?.terminate();
    this.runner = null;
  }

  private finish(generation: number, state: Preparation): void {
    if (generation !== this.generation) return;
    this.runner = null;
    this.settle(state);
  }

  private settle(state: Preparation): void {
    const wasFailed = this.state.kind === "failed";
    this.state = state;
    this.render(wasFailed);
    this.handlers.onChange();
  }

  private render(wasFailed: boolean): void {
    const processing = this.state.kind === "processing";
    this.masthead.classList.toggle("is-processing", processing);
    this.bar.hidden = !processing;
    this.cancel.hidden = !processing;
    this.status.textContent = this.statusText();
    if (this.state.kind === "failed") this.error.textContent = this.state.message;
    else if (wasFailed) this.error.textContent = "";
  }

  private statusText(): string {
    if (this.state.kind === "processing") return LOADING_MESSAGE;
    return this.state.kind === "ready" && this.state.audio.bytes ? "The audio is ready." : "";
  }

  private showProgress(generation: number, progress: ProcessingProgress, target: LoudnessTarget | null): void {
    if (generation !== this.generation) return;
    this.setProgress(progress.fraction);
    if (progress.phase === this.shownPhase) return;
    this.shownPhase = progress.phase;
    this.status.textContent = phaseLabel(progress.phase, target !== null);
  }

  private setProgress(fraction: number): void {
    this.bar.style.setProperty("--progress", String(fraction));
    this.bar.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
  }
}

function phaseLabel(phase: ProcessingPhase, normalizing: boolean): string {
  if (phase === "measuring") return "Measuring loudness…";
  return normalizing ? "Normalizing and encoding…" : "Converting to MP3…";
}
