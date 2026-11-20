import { readMp3Info } from "../audio/mp3Info";
import { loadTagLib } from "../audio/tagLibLoader";
import { ConversionError } from "../convert/errors";
import { FfmpegRunner } from "../convert/ffmpegRunner";
import { processAudio, type MediaRunner, type ProcessedAudio, type ProcessingOptions } from "../convert/processAudio";
import type { ProcessingPhase, ProcessingProgress } from "../convert/progress";
import { describeAudioInfo, describeLoudness, describeTrim, type AudioInfo } from "../domain/audioDescription";
import { LOUDNESS_TARGETS, targetById, type AppliedLoudness, type LoudnessTarget } from "../domain/loudness";
import type { TrimOutcome } from "../domain/trim";
import { isMp3, type AudioSource } from "../io/audioSource";
import { loadSettings, saveSettings, type Settings } from "../settings";
import { AudioPreview } from "./audioPreview";
import { byId, h } from "./dom";

export interface PreparedAudio {
  /** Null means the chosen MP3 is used untouched. */
  blob: Blob | null;
  converted: boolean;
  loudness: AppliedLoudness | null;
  trim: TrimOutcome | null;
}

export interface PreparationServices {
  createRunner(): MediaRunner;
  describeMp3(file: File): Promise<AudioInfo | null>;
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

const MP3_MIME_TYPE = "audio/mpeg";
const LOADING_MESSAGE = "Loading the converter…";
const FAILURE_MESSAGE = "The audio could not be prepared. Try another file.";

const REAL_SERVICES: PreparationServices = {
  createRunner: () => new FfmpegRunner(),
  describeMp3: async (file) => {
    try {
      return await readMp3Info(await loadTagLib(), file);
    } catch {
      return null;
    }
  },
};

export class AudioPreparation {
  private source: AudioSource | null = null;
  private info: AudioInfo | null = null;
  private state: Preparation = { kind: "idle" };
  private runner: MediaRunner | null = null;
  private generation = 0;
  private shownPhase: ProcessingPhase | null = null;

  private readonly masthead = byId("masthead");
  private readonly bar = byId("audioProgress");
  private readonly normalize = byId<HTMLInputElement>("normalize");
  private readonly target = byId<HTMLSelectElement>("loudnessTarget");
  private readonly trimSilence = byId<HTMLInputElement>("trimSilence");
  private readonly status = byId("audioStatus");
  private readonly infoLine = byId("audioInfo");
  private readonly resultLine = byId("audioResult");
  private readonly cancel = byId<HTMLButtonElement>("audioCancel");
  private readonly error = byId("error-file");
  private readonly preview = new AudioPreview();

  constructor(
    private readonly handlers: Handlers,
    private readonly services: PreparationServices = REAL_SERVICES,
  ) {
    this.target.replaceChildren(
      ...LOUDNESS_TARGETS.map((option) => h("option", { value: option.id, textContent: `${option.integratedLufs} LUFS (${option.description})` })),
    );
    this.applySettings(loadSettings());
    for (const control of [this.normalize, this.target, this.trimSilence]) {
      control.addEventListener("change", () => this.onSettingsChanged());
    }
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
    this.info = null;
    if (source && isMp3(source.file)) void this.loadMp3Info(source.file);
    this.start();
  }

  private applySettings(settings: Settings): void {
    this.normalize.checked = settings.normalize;
    this.target.value = settings.targetId;
    this.trimSilence.checked = settings.trimSilence;
    this.target.disabled = !settings.normalize;
  }

  private onSettingsChanged(): void {
    this.target.disabled = !this.normalize.checked;
    saveSettings({ normalize: this.normalize.checked, targetId: targetById(this.target.value).id, trimSilence: this.trimSilence.checked });
    this.start();
  }

  private selectedTarget(): LoudnessTarget | null {
    return this.normalize.checked ? targetById(this.target.value) : null;
  }

  private async loadMp3Info(file: File): Promise<void> {
    const info = await this.services.describeMp3(file);
    if (this.source?.file !== file) return;
    this.info = info;
    this.renderInfo();
  }

  private start(): void {
    this.abandonRun();
    const file = this.source?.file;
    if (!file) return this.settle({ kind: "idle" });
    const options = { target: this.selectedTarget(), trimSilence: this.trimSilence.checked, canKeepOriginal: isMp3(file) };
    if (!options.canKeepOriginal || options.target || options.trimSilence) void this.process(file, options);
    else this.settle({ kind: "ready", audio: { blob: null, converted: false, loudness: null, trim: null } });
  }

  private async process(file: File, options: ProcessingOptions): Promise<void> {
    const generation = this.generation;
    const runner = this.services.createRunner();
    this.runner = runner;
    this.shownPhase = null;
    this.setProgress(0);
    this.settle({ kind: "processing" });
    try {
      const result = await processAudio(runner, file, options, (progress) => this.showProgress(generation, progress));
      this.succeed(generation, options, result);
    } catch (failure) {
      if (!(failure instanceof ConversionError)) console.error("Audio processing failed.", failure);
      this.finish(generation, { kind: "failed", message: failure instanceof ConversionError ? failure.message : FAILURE_MESSAGE });
    }
  }

  private succeed(generation: number, options: ProcessingOptions, result: ProcessedAudio): void {
    if (generation !== this.generation) return;
    const converted = !options.canKeepOriginal;
    if (converted) this.info = result.info;
    const loudness = options.target && result.loudness ? { target: options.target, ...result.loudness } : null;
    const blob = result.bytes && new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: MP3_MIME_TYPE });
    this.finish(generation, { kind: "ready", audio: { blob, converted, loudness, trim: result.trim } });
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
    this.renderInfo();
    this.renderResult();
  }

  private statusText(): string {
    if (this.state.kind === "processing") return LOADING_MESSAGE;
    return this.state.kind === "ready" && this.state.audio.blob ? "The audio is ready." : "";
  }

  private renderInfo(): void {
    this.infoLine.textContent = this.info ? describeAudioInfo(this.info) : "";
  }

  private renderResult(): void {
    const audio = this.prepared;
    this.resultLine.textContent = audio ? summarize(audio) : "";
    if (audio && this.source) this.preview.show(audio.blob ?? this.source.file);
    else this.preview.hide();
  }

  private showProgress(generation: number, progress: ProcessingProgress): void {
    if (generation !== this.generation) return;
    this.setProgress(progress.fraction);
    if (progress.phase === this.shownPhase) return;
    this.shownPhase = progress.phase;
    this.status.textContent = phaseLabel(progress.phase);
  }

  private setProgress(fraction: number): void {
    this.bar.style.setProperty("--progress", String(fraction));
    this.bar.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
  }
}

function summarize({ loudness, trim }: PreparedAudio): string {
  const parts = [loudness ? `Loudness: ${describeLoudness(loudness)}` : "", trim ? describeTrim(trim) : ""];
  return parts.filter((part) => part !== "").join(" ");
}

function phaseLabel(phase: ProcessingPhase): string {
  switch (phase) {
    case "detecting":
      return "Looking for silence…";
    case "measuring":
      return "Measuring loudness…";
    case "normalizing":
      return "Normalizing and encoding…";
    case "encoding":
      return "Encoding MP3…";
  }
}
