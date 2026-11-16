import { describe, expect, it } from "vitest";
import { normalizeShowName, showKey } from "../src/domain/text";
import { isRealIsoDate, validateForm, type RawForm } from "../src/domain/validation";

const valid: RawForm = {
  hasFile: true,
  hasCover: true,
  show: "Quick",
  episode: "7",
  episodeTitle: "  Spaced   out ",
  contributors: ["DJ B"],
  broadcastDate: "2002-02-02",
};

describe("validateForm", () => {
  it("accepts a complete form and normalizes values", () => {
    const result = validateForm(valid);
    expect(result).toEqual({
      ok: true,
      draft: expect.objectContaining({ episode: 7, episodeTitle: "Spaced out" }),
    });
  });

  it("treats an empty episode as none", () => {
    const result = validateForm({ ...valid, episode: "" });
    expect(result.ok && result.draft.episode).toBeNull();
  });

  it("reports every missing required field", () => {
    const result = validateForm({ ...valid, hasFile: false, hasCover: false, show: "", broadcastDate: "" });
    expect(result).toEqual({ ok: false, errors: expect.objectContaining({ file: expect.any(String), cover: expect.any(String), show: expect.any(String), date: expect.any(String) }) });
  });

  it.each(["CINCO", "-3", "1.5", "1234567"])("rejects episode %s", (episode) => {
    const result = validateForm({ ...valid, episode });
    expect(!result.ok && result.errors.episode).toBeTruthy();
  });
});

describe("isRealIsoDate", () => {
  it.each([["2024-02-29", true], ["2023-02-29", false], ["2023-13-01", false], ["24-01-01", false], ["", false]])(
    "%s -> %s",
    (value, expected) => expect(isRealIsoDate(value)).toBe(expected),
  );
});

describe("show names", () => {
  it("straightens quotes and collapses whitespace", () => {
    expect(normalizeShowName("  Mike’s   “Hour” ")).toBe("Mike's \"Hour\"");
  });

  it("treats variations as the same show", () => {
    expect(showKey("Mike’s Hour")).toBe(showKey("mike's  hour"));
  });
});
