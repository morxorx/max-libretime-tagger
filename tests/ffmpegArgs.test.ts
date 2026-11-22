import { describe, expect, it } from "vitest";
import { LOUDNESS_TARGETS } from "../src/domain/loudness";
import { buildDetectArgs, buildEncodeArgs, buildLoudnormMeasureArgs, buildMeasureArgs, resolveOutputRate, type NormalizationPlan } from "../src/convert/ffmpegArgs";

const [broadcast] = LOUDNESS_TARGETS;
const gain: NormalizationPlan = { kind: "gain", target: broadcast!, gainDb: 4.8 };
const loudnorm: NormalizationPlan = {
  kind: "loudnorm",
  target: broadcast!,
  measurement: { integrated: -27.6, truePeak: -3.1, range: 4.2, threshold: -38, offset: 0.5 },
  sampleRate: 44100,
};
const window = { start: 1.75, end: 11.75, fadeIn: true, fadeOut: true };
const TRIM_FILTER = "atrim=start=1.750:end=11.750,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.000,afade=t=out:st=9.000:d=1.000";

const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("buildDetectArgs", () => {
  it("looks for silence without writing audio", () => {
    const args = buildDetectArgs();
    expect(valueAfter(args, "-af")).toBe("silencedetect=noise=-70dB:d=1");
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
  });
});

describe("buildMeasureArgs", () => {
  it("measures loudness and true peak without writing audio or per-frame log lines", () => {
    const args = buildMeasureArgs(null);
    expect(valueAfter(args, "-af")).toBe("ebur128=peak=true:framelog=verbose");
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
  });

  it("measures only the part that will be kept", () => {
    expect(valueAfter(buildMeasureArgs(window), "-af")).toBe(`${TRIM_FILTER},ebur128=peak=true:framelog=verbose`);
  });
});

describe("buildLoudnormMeasureArgs", () => {
  it("measures against the target for the loudnorm route", () => {
    expect(valueAfter(buildLoudnormMeasureArgs(broadcast!, null), "-af")).toBe("loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json");
  });

  it("measures only the part that will be kept", () => {
    expect(valueAfter(buildLoudnormMeasureArgs(broadcast!, window), "-af")).toBe(`${TRIM_FILTER},loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json`);
  });
});

describe("buildEncodeArgs", () => {
  it("encodes 320 kbps CBR MP3 without source metadata", () => {
    const args = buildEncodeArgs({ trim: null, normalization: null });
    expect(valueAfter(args, "-c:a")).toBe("libmp3lame");
    expect(valueAfter(args, "-b:a")).toBe("320k");
    expect(valueAfter(args, "-map_metadata")).toBe("-1");
    expect(args).not.toContain("-af");
    expect(args.at(-1)).toBe("output.mp3");
  });

  it("only trims when there is nothing to normalize", () => {
    const args = buildEncodeArgs({ trim: window, normalization: null });
    expect(valueAfter(args, "-af")).toBe(TRIM_FILTER);
    expect(args).not.toContain("-ar");
  });

  it("applies a plain gain and leaves the sample rate alone", () => {
    const args = buildEncodeArgs({ trim: null, normalization: gain });
    expect(valueAfter(args, "-af")).toBe("volume=4.800dB");
    expect(args).not.toContain("-ar");
  });

  it("applies the measured values in linear mode on the loudnorm route and pins the sample rate", () => {
    const args = buildEncodeArgs({ trim: null, normalization: loudnorm });
    expect(valueAfter(args, "-af")).toBe(
      "loudnorm=I=-23:TP=-1.5:LRA=11:measured_I=-27.6:measured_TP=-3.1:measured_LRA=4.2:measured_thresh=-38:offset=0.5:linear=true:print_format=json",
    );
    expect(valueAfter(args, "-ar")).toBe("44100");
  });

  it("trims before normalizing", () => {
    expect(valueAfter(buildEncodeArgs({ trim: window, normalization: gain }), "-af")).toBe(`${TRIM_FILTER},volume=4.800dB`);
    expect(valueAfter(buildEncodeArgs({ trim: window, normalization: loudnorm }), "-af")).toMatch(new RegExp(`^${TRIM_FILTER},loudnorm=`));
  });
});

describe("fades at the cuts", () => {
  const filterFor = (trim: typeof window) => valueAfter(buildEncodeArgs({ trim, normalization: null }), "-af") ?? "";

  it("fades only the edges that were trimmed", () => {
    expect(filterFor({ ...window, fadeIn: false })).not.toContain("t=in");
    expect(filterFor({ ...window, fadeOut: false })).not.toContain("t=out");
  });

  it("shortens the fades for a very short recording", () => {
    expect(filterFor({ start: 0, end: 1, fadeIn: true, fadeOut: true })).toContain("afade=t=in:st=0:d=0.500");
  });
});

describe("resolveOutputRate", () => {
  it.each([[44100, 44100], [48000, 48000], [32000, 32000], [96000, 48000], [88200, 44100], [22050, 44100], [null, 44100], [undefined, 44100]])(
    "%s Hz -> %s Hz",
    (source, expected) => expect(resolveOutputRate(source)).toBe(expected),
  );
});
