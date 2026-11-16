import { describe, expect, it } from "vitest";
import { cropSquare, initialCrop, outputSize, panCrop, zoomCrop } from "../src/cover/cropMath";

const landscape = { width: 1600, height: 1000 };

describe("cropSquare", () => {
  it("starts as the largest centered square", () => {
    expect(cropSquare(landscape, initialCrop(landscape))).toEqual({ x: 300, y: 0, size: 1000 });
  });

  it("shrinks when zooming and keeps the center", () => {
    const zoomed = zoomCrop(landscape, initialCrop(landscape), 2);
    expect(cropSquare(landscape, zoomed)).toEqual({ x: 550, y: 250, size: 500 });
  });

  it("clamps zoom to the allowed range", () => {
    expect(zoomCrop(landscape, initialCrop(landscape), 99).zoom).toBe(4);
    expect(zoomCrop(landscape, initialCrop(landscape), 0.2).zoom).toBe(1);
  });
});

describe("panCrop", () => {
  it("cannot leave the image", () => {
    const panned = panCrop(landscape, initialCrop(landscape), -5000, 5000);
    expect(cropSquare(landscape, panned)).toEqual({ x: 0, y: 0, size: 1000 });
  });

  it("moves freely inside the image", () => {
    const zoomed = zoomCrop(landscape, initialCrop(landscape), 2);
    const panned = panCrop(landscape, zoomed, 100, -50);
    expect(cropSquare(landscape, panned)).toEqual({ x: 650, y: 200, size: 500 });
  });
});

describe("outputSize", () => {
  it("never exceeds 1400 pixels and never upscales", () => {
    expect(outputSize({ x: 0, y: 0, size: 3000 })).toBe(1400);
    expect(outputSize({ x: 0, y: 0, size: 600.4 })).toBe(600);
  });
});
