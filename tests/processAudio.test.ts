import { describe, expect, it, vi } from "vitest";
import { ConversionError } from "../src/convert/errors";
import { MAX_INPUT_BYTES, processAudio, type MediaRunner, type ProcessingOptions } from "../src/convert/processAudio";
import { plannedPasses, progressOf, type ProcessingProgress } from "../src/convert/progress";
import { targetById } from "../src/domain/loudness";
import { ebur128Log } from "./fakes";

const broadcast = targetById("ebu-r128");
const wav = new File([new Uint8Array([1, 2, 3])], "show.wav");

const INPUT = "Input #0, wav, from 'source':\n  Duration: 00:01:40.00, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le, 48000 Hz, stereo, s16, 1411 kb/s\n";
const SILENCE = `${INPUT}[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 10 | silence_duration: 10\n[silencedetect @ 0x1] silence_start: 90\n[silencedetect @ 0x1] silence_end: 100 | silence_duration: 100`;
const NO_SILENCE = `${INPUT}no silence here`;
const LOUDNORM_MEASURE = `${INPUT}{"input_i":"-30.0","input_tp":"-3.0","input_lra":"3.0","input_thresh":"-40.0","target_offset":"1.0"}`;
const LOUDNORM_APPLIED = `{"input_i":"-30.0","output_i":"-23.1","normalization_type":"dynamic","target_offset":"1.0"}`;

const options = (overrides: Partial<ProcessingOptions> = {}): ProcessingOptions => ({ target: null, trimSilence: false, canKeepOriginal: false, ...overrides });

function fakeRunner(logs: string[], ratios: number[] = []): MediaRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    mount: vi.fn(async () => {}),
    run: vi.fn(async (args: string[], onProgress: (ratio: number) => void) => {
      calls.push(args);
      onProgress(ratios[calls.length - 1] ?? 0.5);
      return logs[calls.length - 1] ?? "";
    }),
    readOutput: vi.fn(async () => new Uint8Array([9, 9])),
    terminate: vi.fn(),
  };
}

const filterOf = (args: string[]) => (args.includes("-af") ? (args[args.indexOf("-af") + 1] ?? "") : "");
const TRIM = "atrim=start=9.500:end=90.500,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.000,afade=t=out:st=80.000:d=1.000";

describe("processAudio", () => {
  it("converts in one pass when nothing else is asked for", async () => {
    const runner = fakeRunner([INPUT]);
    const result = await processAudio(runner, wav, options(), () => {});
    expect(runner.calls).toHaveLength(1);
    expect(result).toMatchObject({ bytes: new Uint8Array([9, 9]), loudness: null, trim: null });
    expect(result.info).toMatchObject({ codec: "pcm", sampleRateHz: 48000, durationSeconds: 100 });
  });

  describe("normalizing with a plain gain", () => {
    it("measures with ebur128, then applies the gain without loudnorm", async () => {
      const runner = fakeRunner([ebur128Log("-30.0", "-12.0"), ""]);
      const result = await processAudio(runner, wav, options({ target: broadcast }), () => {});
      expect(runner.calls).toHaveLength(2);
      expect(filterOf(runner.calls[0]!)).toBe("ebur128=peak=true:framelog=verbose");
      expect(filterOf(runner.calls[1]!)).toBe("volume=7.000dB");
      expect(runner.calls[1]).not.toContain("-ar");
      expect(result.loudness).toEqual({ measuredLufs: -30, measuredTruePeak: -12, expectedLufs: -23, type: "linear" });
    });

    it("attenuates loud material the same way", async () => {
      const runner = fakeRunner([ebur128Log("-9.0", "-0.5"), ""]);
      await processAudio(runner, wav, options({ target: broadcast }), () => {});
      expect(filterOf(runner.calls[1]!)).toBe("volume=-14.000dB");
    });

    it("measures and encodes only the part that is kept after trimming", async () => {
      const runner = fakeRunner([SILENCE, ebur128Log("-30.0", "-12.0"), ""]);
      const result = await processAudio(runner, wav, options({ target: broadcast, trimSilence: true }), () => {});
      expect(runner.calls).toHaveLength(3);
      expect(filterOf(runner.calls[0]!)).toContain("silencedetect");
      expect(filterOf(runner.calls[1]!)).toBe(`${TRIM},ebur128=peak=true:framelog=verbose`);
      expect(filterOf(runner.calls[2]!)).toBe(`${TRIM},volume=7.000dB`);
      expect(result.trim).toEqual({ kind: "trimmed", startSeconds: 9.5, endSeconds: 9.5 });
    });
  });

  describe("when the gain would push the peak over the ceiling", () => {
    it("falls back to the two-pass loudnorm route", async () => {
      const runner = fakeRunner([ebur128Log("-30.0", "-3.0"), LOUDNORM_MEASURE, LOUDNORM_APPLIED]);
      const result = await processAudio(runner, wav, options({ target: broadcast }), () => {});
      expect(runner.calls).toHaveLength(3);
      expect(filterOf(runner.calls[1]!)).toBe("loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json");
      expect(filterOf(runner.calls[2]!)).toContain("measured_I=-30");
      expect(runner.calls[2]).toContain("44100");
      expect(result.loudness).toEqual({ measuredLufs: -30, measuredTruePeak: -3, expectedLufs: -23.1, type: "dynamic" });
    });

    it("also falls back when the loudness is right but the peak is above the limit", async () => {
      const runner = fakeRunner([ebur128Log("-23.2", "-0.2"), LOUDNORM_MEASURE, LOUDNORM_APPLIED]);
      expect((await processAudio(runner, wav, options({ target: broadcast, canKeepOriginal: true }), () => {})).bytes).not.toBeNull();
      expect(runner.calls).toHaveLength(3);
    });

    it("never lets the progress bar move backwards when the extra pass is added", async () => {
      const seen: number[] = [];
      const runner = fakeRunner([ebur128Log("-30.0", "-3.0"), LOUDNORM_MEASURE, LOUDNORM_APPLIED], [1, 0, 0.5]);
      await processAudio(runner, wav, options({ target: broadcast }), (progress) => seen.push(progress.fraction));
      expect(seen).toHaveLength(3);
      expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    });
  });

  describe("when the loudness is already right", () => {
    it("keeps a plain MP3 untouched", async () => {
      const runner = fakeRunner([ebur128Log("-23.2", "-3.0")]);
      const result = await processAudio(runner, wav, options({ target: broadcast, canKeepOriginal: true }), () => {});
      expect(runner.calls).toHaveLength(1);
      expect(result.bytes).toBeNull();
      expect(result.loudness).toEqual({ measuredLufs: -23.2, measuredTruePeak: -3, expectedLufs: -23.2, type: "unchanged" });
    });

    it("accepts a true peak right at the EBU limit of -1 dBTP", async () => {
      const result = await processAudio(fakeRunner([ebur128Log("-23.1", "-1.0")]), wav, options({ target: broadcast, canKeepOriginal: true }), () => {});
      expect(result.bytes).toBeNull();
    });

    it("only encodes a converted file, without any normalization filter", async () => {
      const runner = fakeRunner([ebur128Log("-23.2", "-3.0"), ""]);
      const result = await processAudio(runner, wav, options({ target: broadcast }), () => {});
      expect(filterOf(runner.calls[1]!)).toBe("");
      expect(result.loudness?.type).toBe("unchanged");
    });

    it("re-encodes an MP3 whose edges were trimmed", async () => {
      const runner = fakeRunner([SILENCE, ebur128Log("-23.2", "-3.0"), ""]);
      const result = await processAudio(runner, wav, options({ target: broadcast, trimSilence: true, canKeepOriginal: true }), () => {});
      expect(result.bytes).not.toBeNull();
      expect(filterOf(runner.calls[2]!)).toBe(TRIM);
    });
  });

  it("reports when there was no silence to trim", async () => {
    const result = await processAudio(fakeRunner([NO_SILENCE]), wav, options({ trimSilence: true, canKeepOriginal: true }), () => {});
    expect(result.bytes).toBeNull();
    expect(result.trim).toEqual({ kind: "none" });
  });

  it("refuses silent audio", async () => {
    await expect(processAudio(fakeRunner([ebur128Log("-70.0", "-inf")]), wav, options({ target: broadcast }), () => {})).rejects.toThrow(/silent/);
  });

  it("reports progress across all passes in order", async () => {
    const seen: ProcessingProgress[] = [];
    await processAudio(fakeRunner([SILENCE, ebur128Log("-30.0", "-12.0"), ""]), wav, options({ target: broadcast, trimSilence: true }), (progress) => seen.push(progress));
    expect(seen.map((progress) => progress.phase)).toEqual(["detecting", "measuring", "normalizing"]);
    [0.05, 0.25, 0.7].forEach((fraction, index) => expect(seen[index]?.fraction).toBeCloseTo(fraction));
  });

  it("always releases the runner, even when a pass fails", async () => {
    const runner = fakeRunner([]);
    runner.run = vi.fn(async () => {
      throw new ConversionError("broken");
    });
    await expect(processAudio(runner, wav, options(), () => {})).rejects.toThrow("broken");
    expect(runner.terminate).toHaveBeenCalledOnce();
  });

  it("refuses files that are too large for the browser", async () => {
    const huge = { size: MAX_INPUT_BYTES + 1 } as File;
    await expect(processAudio(fakeRunner([]), huge, options(), () => {})).rejects.toThrow(ConversionError);
  });
});

describe("progressOf", () => {
  it.each([
    [["encoding"], "encoding", 0.4, 0.4],
    [["measuring", "encoding"], "measuring", 1, 0.3 / 0.9],
    [["measuring", "encoding"], "normalizing", 0, 0.3 / 0.9],
    [["measuring", "refining", "encoding"], "refining", 0.5, 0.8 / 1.9],
    [["encoding"], "encoding", 7, 1],
    [["encoding"], "encoding", -1, 0],
    [["measuring", "encoding"], "normalizing", Number.NaN, 0.3 / 0.9],
  ] as const)("%j %s %s -> %s", (planned, phase, ratio, fraction) => {
    expect(progressOf(phase, ratio, [...planned]).fraction).toBeCloseTo(fraction);
  });
});

describe("plannedPasses", () => {
  it("always ends with encoding and adds the optional passes in order", () => {
    expect(plannedPasses({ trimSilence: false, normalize: false })).toEqual(["encoding"]);
    expect(plannedPasses({ trimSilence: true, normalize: true })).toEqual(["detecting", "measuring", "encoding"]);
  });
});
