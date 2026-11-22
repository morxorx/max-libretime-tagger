import { vi } from "vitest";
import { ConversionError } from "../src/convert/errors";
import type { MediaRunner } from "../src/convert/processAudio";
import { sourceFromFile, type AudioSource } from "../src/io/audioSource";

export const INPUT_LOG = "Input #0, wav, from 'source':\n  Duration: 00:00:10.00, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s\n";
export const ebur128Log = (lufs: string, peak: string) =>
  `${INPUT_LOG}[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         ${lufs} LUFS\n    Threshold: -40.0 LUFS\n\n  Loudness range:\n    LRA:         3.0 LU\n\n  True peak:\n    Peak:       ${peak} dBFS`;
export const MEASUREMENT_LOG = ebur128Log("-30.0", "-12.0");
export const APPLIED_LOG = INPUT_LOG;

export const source = (name: string): AudioSource => sourceFromFile(new File([new Uint8Array([1])], name));
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export type Behaviour = "succeeds" | "fails" | "hangs";

export function runnerThat(behaviour: Behaviour): MediaRunner {
  return {
    mount: async () => {},
    run: vi.fn(async (args: string[]) => {
      if (behaviour === "hangs") return new Promise<string>(() => {});
      if (behaviour === "fails") throw new ConversionError("Broken audio.");
      return args.includes("null") ? MEASUREMENT_LOG : APPLIED_LOG;
    }),
    readOutput: async () => new Uint8Array([7]),
    terminate: vi.fn(),
  };
}

export interface ManualRunner {
  runner: MediaRunner;
  finish(): void;
  fail(): void;
}

/** A runner whose single pass stays open until the test finishes or fails it. */
export function manualRunner(): ManualRunner {
  let resolve!: (log: string) => void;
  let reject!: (error: Error) => void;
  const pass = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
  pass.catch(() => {});
  const runner: MediaRunner = {
    mount: async () => {},
    run: vi.fn(() => pass),
    readOutput: async () => new Uint8Array([7]),
    terminate: vi.fn(() => reject(new Error("terminated"))),
  };
  return { runner, finish: () => resolve(INPUT_LOG), fail: () => reject(new ConversionError("Broken audio.")) };
}
