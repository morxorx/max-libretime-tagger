export interface Dimensions {
  width: number;
  height: number;
}

export interface CropState {
  zoom: number;
  centerX: number;
  centerY: number;
}

export interface Square {
  x: number;
  y: number;
  size: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const MAX_COVER_PIXELS = 1400;

export function initialCrop(image: Dimensions): CropState {
  return { zoom: MIN_ZOOM, centerX: image.width / 2, centerY: image.height / 2 };
}

export function cropSquare(image: Dimensions, crop: CropState): Square {
  const size = Math.min(image.width, image.height) / clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  return {
    size,
    x: clamp(crop.centerX - size / 2, 0, image.width - size),
    y: clamp(crop.centerY - size / 2, 0, image.height - size),
  };
}

export function panCrop(image: Dimensions, crop: CropState, deltaX: number, deltaY: number): CropState {
  return settle(image, { ...crop, centerX: crop.centerX + deltaX, centerY: crop.centerY + deltaY });
}

export function zoomCrop(image: Dimensions, crop: CropState, zoom: number): CropState {
  return settle(image, { ...crop, zoom });
}

export function outputSize(square: Square): number {
  return Math.min(MAX_COVER_PIXELS, Math.round(square.size));
}

function settle(image: Dimensions, crop: CropState): CropState {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const square = cropSquare(image, { ...crop, zoom });
  return { zoom, centerX: square.x + square.size / 2, centerY: square.y + square.size / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
