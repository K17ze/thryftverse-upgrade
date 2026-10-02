import {
  COLOR_VOCAB,
  type ImageFeatures,
  type VisualSearchRegion,
} from '../visualSearchTypes';
import type { DecodedImage } from './imageDecode';

export const SAMPLE = 16; // 16×16 histogram sample, same as the backend heuristic.

/** Weighted RGB distance — green channel carries more perceptual weight. */
export function colourDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db) * Math.sqrt(3);
}

export function nearestColour(
  rgb: [number, number, number],
): { name: string; confidence: number } {
  let best = COLOR_VOCAB[0];
  let bestDist = Infinity;
  for (const c of COLOR_VOCAB) {
    const d = colourDistance(rgb, c.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // d≈0 → 1; d≈140 (adjacent vocab anchors) → ~0.3; far anchors → ~0.
  const confidence = Math.exp(-(bestDist * bestDist) / (2 * 85 * 85));
  return { name: best.name, confidence };
}

/**
 * Extract the compact feature signature. When `region` is set the canvas
 * samples only that rect (drawImage source crop) — the exact behaviour the
 * mobile cropper pays the backend for, done locally.
 */
export function extractFeatures(
  image: DecodedImage,
  region: VisualSearchRegion | null,
): ImageFeatures {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no canvas context');

  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (region) {
    sx = Math.round(region.x * image.width);
    sy = Math.round(region.y * image.height);
    sw = Math.max(1, Math.round(region.width * image.width));
    sh = Math.max(1, Math.round(region.height * image.height));
  }
  ctx.drawImage(image.source, sx, sy, sw, sh, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  const bins = new Float64Array(64);
  const binSum = new Float64Array(64 * 3);
  let lumSum = 0;
  let lumSq = 0;
  let satSum = 0;
  const px = SAMPLE * SAMPLE;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const bin = Math.min(3, r >> 6) * 16 + Math.min(3, g >> 6) * 4 + Math.min(3, b >> 6);
    bins[bin] += 1;
    binSum[bin * 3] += r;
    binSum[bin * 3 + 1] += g;
    binSum[bin * 3 + 2] += b;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    lumSum += lum;
    lumSq += lum * lum;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }

  // Dominant cluster = fullest histogram bin; its member mean is the
  // palette anchor (a plain global mean gets dragged by the background).
  let topBin = 0;
  for (let i = 1; i < 64; i++) if (bins[i] > bins[topBin]) topBin = i;
  const n = Math.max(1, bins[topBin]);
  const rgb: [number, number, number] = [
    Math.round(binSum[topBin * 3] / n),
    Math.round(binSum[topBin * 3 + 1] / n),
    Math.round(binSum[topBin * 3 + 2] / n),
  ];

  const luminance = lumSum / px;
  const contrast = Math.min(1, Math.sqrt(Math.max(0, lumSq / px - luminance * luminance)) / 0.5);
  const { name, confidence } = nearestColour(rgb);

  return {
    rgb,
    colorName: name,
    colorConfidence: confidence,
    luminance,
    contrast,
    saturation: satSum / px,
    aspectRatio: sw / sh,
  };
}
