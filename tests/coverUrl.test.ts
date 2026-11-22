import { describe, expect, it } from "vitest";
import { CoverUrlError, fetchCoverImage, firstUriFromDrop, parseImageUrl } from "../src/cover/coverUrl";

const image = (type = "image/png", status = 200) => async () =>
  new Response(new Uint8Array([1, 2, 3]), { status, headers: { "content-type": type } });

describe("parseImageUrl", () => {
  it("accepts https links", () => {
    expect(parseImageUrl("  https://example.org/cover.png ").href).toBe("https://example.org/cover.png");
  });

  it.each(["not a link", "", "http://example.org/a.png", "ftp://example.org/a.png"])("rejects %j", (text) => {
    expect(() => parseImageUrl(text)).toThrow(CoverUrlError);
  });
});

describe("fetchCoverImage", () => {
  const url = new URL("https://example.org/art/cover.png");

  it("returns the image as a file named after the link", async () => {
    const file = await fetchCoverImage(url, image("image/png; charset=binary") as typeof fetch);
    expect(file.name).toBe("cover.png");
    expect(file.type).toBe("image/png");
  });

  it("explains copy and paste when the request is blocked", async () => {
    const blocked = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    await expect(fetchCoverImage(url, blocked)).rejects.toThrow(/Ctrl\+V/);
  });

  it("reports an error status", async () => {
    await expect(fetchCoverImage(url, image("image/png", 404) as typeof fetch)).rejects.toThrow(/404/);
  });

  it("rejects links that are not an accepted image", async () => {
    await expect(fetchCoverImage(url, image("text/html") as typeof fetch)).rejects.toThrow(/PNG, JPG or WebP/);
  });
});

describe("firstUriFromDrop", () => {
  it("skips comments and blank lines", () => {
    expect(firstUriFromDrop("# source\r\n\r\nhttps://example.org/a.png\r\nhttps://example.org/b.png")).toBe("https://example.org/a.png");
  });

  it("is null for empty data", () => {
    expect(firstUriFromDrop("")).toBeNull();
  });
});
