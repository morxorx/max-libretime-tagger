// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversionError } from "../src/convert/errors";
import type { MediaRunner } from "../src/convert/processAudio";
import type { AudioInfo } from "../src/domain/audioDescription";
import { sourceFromFile } from "../src/io/audioSource";
import { saveSettings } from "../src/settings";
import { AudioPreparation, type PreparationServices } from "../src/ui/audioPreparation";

const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html").body.innerHTML;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const source = (name: string) => sourceFromFile(new File([new Uint8Array([1])], name));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const INPUT = "Input #0, wav, from 'source':\n  Duration: 00:00:10.00, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s\n";
const MEASUREMENT = `${INPUT}{"input_i":"-30","input_tp":"-5","input_lra":"3","input_thresh":"-40","target_offset":"1"}`;
const MP3_INFO: AudioInfo = { codec: "MP3", durationSeconds: 65, sampleRateHz: 44100, channels: 2, bitrateKbps: 128 };

function runnerThat(behaviour: "succeeds" | "fails" | "hangs") {
  const runner: MediaRunner = {
    mount: async () => {},
    run: vi.fn(async (args: string[]) => {
      if (behaviour === "hangs") return new Promise<string>(() => {});
      if (behaviour === "fails") throw new ConversionError("Broken audio.");
      return args.includes("null") ? MEASUREMENT : `${INPUT}{"output_i":"-23.1","normalization_type":"linear"}`;
    }),
    readOutput: async () => new Uint8Array([7]),
    terminate: vi.fn(),
  };
  return runner;
}

function setUp(runner: MediaRunner) {
  const handlers = { onChange: vi.fn(), onCancel: vi.fn() };
  const services: PreparationServices = { createRunner: () => runner, describeMp3: async () => MP3_INFO };
  return { preparation: new AudioPreparation(handlers, services), handlers };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = page;
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

describe("AudioPreparation", () => {
  it("offers both loudness targets and keeps the selector off until normalizing", () => {
    setUp(runnerThat("succeeds"));
    expect([...element<HTMLSelectElement>("loudnessTarget").options].map((option) => option.value)).toEqual(["ebu-r128", "streaming"]);
    expect(element<HTMLSelectElement>("loudnessTarget").disabled).toBe(true);
  });

  it("uses a plain MP3 as it is, shows what it is and offers a preview", async () => {
    const { preparation } = setUp(runnerThat("succeeds"));
    preparation.load(source("show.mp3"));
    await flush();
    expect(preparation.prepared).toEqual({ blob: null, converted: false, loudness: null, trim: null });
    expect(element("audioInfo").textContent).toBe("MP3 · 1:05 · 44.1 kHz · stereo · 128 kb/s");
    expect(element("audioPreview").hidden).toBe(false);
  });

  it("converts other formats, describes the source and reports the result", async () => {
    const { preparation } = setUp(runnerThat("succeeds"));
    preparation.load(source("show.wav"));
    expect(preparation.isProcessing()).toBe(true);
    expect(element("audioProgress").hidden).toBe(false);
    expect(element("audioPreview").hidden).toBe(true);
    await flush();
    expect(preparation.prepared).toMatchObject({ converted: true, loudness: null, trim: null });
    expect(preparation.prepared?.blob?.size).toBe(1);
    expect(element("audioInfo").textContent).toBe("PCM · 0:10 · 44.1 kHz · stereo · 1411 kb/s");
    expect(element("audioProgress").hidden).toBe(true);
  });

  it("re-runs an MP3 once normalization is switched on and shows the loudness change", async () => {
    const { preparation } = setUp(runnerThat("succeeds"));
    preparation.load(source("show.mp3"));
    element<HTMLInputElement>("normalize").click();
    expect(element<HTMLSelectElement>("loudnessTarget").disabled).toBe(false);
    await flush();
    expect(preparation.prepared?.loudness).toMatchObject({ target: { id: "ebu-r128" }, type: "linear", measuredLufs: -30, expectedLufs: -23.1 });
    expect(element("audioResult").textContent).toBe("Loudness: -30.0 LUFS → about -23.1 LUFS.");
  });

  it("starts processing an MP3 when silence trimming is switched on", async () => {
    const runner = runnerThat("succeeds");
    const { preparation } = setUp(runner);
    preparation.load(source("show.mp3"));
    element<HTMLInputElement>("trimSilence").click();
    expect(preparation.isProcessing()).toBe(true);
    await flush();
    expect(preparation.prepared?.trim).toEqual({ kind: "none" });
  });

  it("restores and remembers the settings", () => {
    saveSettings({ normalize: true, targetId: "streaming", trimSilence: true });
    setUp(runnerThat("succeeds"));
    expect(element<HTMLInputElement>("normalize").checked).toBe(true);
    expect(element<HTMLSelectElement>("loudnessTarget").value).toBe("streaming");
    expect(element<HTMLSelectElement>("loudnessTarget").disabled).toBe(false);
    element<HTMLInputElement>("trimSilence").click();
    expect(JSON.parse(localStorage.getItem("sphere-tagger-settings") ?? "{}")).toEqual({ normalize: true, targetId: "streaming", trimSilence: false });
  });

  it("shows the failure on the file field", async () => {
    const { preparation } = setUp(runnerThat("fails"));
    preparation.load(source("show.flac"));
    await flush();
    expect(preparation.prepared).toBeNull();
    expect(element("error-file").textContent).toBe("Broken audio.");
  });

  it("abandons a running job when the file is cleared", () => {
    const runner = runnerThat("hangs");
    const { preparation } = setUp(runner);
    preparation.load(source("show.wav"));
    preparation.load(null);
    expect(runner.terminate).toHaveBeenCalled();
    expect(preparation.isProcessing()).toBe(false);
    expect(element("audioPreview").hidden).toBe(true);
  });

  it("hands the cancel button over to the app", () => {
    const { preparation, handlers } = setUp(runnerThat("hangs"));
    preparation.load(source("show.wav"));
    element("audioCancel").click();
    expect(handlers.onCancel).toHaveBeenCalledOnce();
  });
});
