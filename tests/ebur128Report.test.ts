import { describe, expect, it } from "vitest";
import { ConversionError } from "../src/convert/errors";
import { parseReading } from "../src/convert/ebur128Report";
import { ebur128Log } from "./fakes";

describe("parseReading", () => {
  it("reads the integrated loudness and the true peak from the summary", () => {
    expect(parseReading(ebur128Log("-27.6", "-3.1"))).toEqual({ integrated: -27.6, truePeak: -3.1 });
  });

  it("uses the summary, not earlier lines that look similar", () => {
    const log = `t: 3.0 M: -20.1 S: -22.0 I: -50.0 LUFS LRA: 0.0 LU\n${ebur128Log("-27.6", "-3.1")}`;
    expect(parseReading(log).integrated).toBe(-27.6);
  });

  it("treats the absolute gate value as silence", () => {
    expect(() => parseReading(ebur128Log("-70.0", "-inf"))).toThrow(/silent/);
  });

  it("rejects a log without a summary", () => {
    expect(() => parseReading("nothing useful")).toThrow(ConversionError);
  });
});
