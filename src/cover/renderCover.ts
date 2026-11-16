import { outputSize, type Square } from "./cropMath";

const JPEG_QUALITY = 0.85;
const BACKGROUND = "#ffffff";

export async function renderCover(image: ImageBitmap, square: Square): Promise<Blob> {
  const size = outputSize(square);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The cover image could not be prepared.");
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, size, size);
  context.drawImage(image, square.x, square.y, square.size, square.size, 0, 0, size, size);
  return toJpeg(canvas);
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The cover image could not be converted to JPEG."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
