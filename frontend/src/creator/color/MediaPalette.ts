/**
 * MediaPalette — extract dominant colors from an image.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §5:
 * Generate 5-8 suggestions: dominant, light, dark, accents, complementary neutral.
 *
 * Uses expo-image-manipulator to downscale the image to a small thumbnail,
 * then performs simple color quantization (median-cut style bucketing) to
 * find the most representative colors. This runs entirely in JS after
 * the image is loaded — no native pixel readback required.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CreatorColor, MediaPaletteEntry } from './ColorTypes';
import { normalize, rgb255 } from './ColorMath';

// Skia is used for pixel readback (same pattern as AutoAdjust.ts)
let skiaAvailable = false;
let SkiaModule: typeof import('@shopify/react-native-skia').Skia | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@shopify/react-native-skia');
  if (mod && mod.Skia) {
    skiaAvailable = true;
    SkiaModule = mod.Skia;
  }
} catch {
  skiaAvailable = false;
}

// ── Types ────────────────────────────────────────────────────────────

interface PixelBucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

// ── Constants ────────────────────────────────────────────────────────

/** Downscale target for quantization — small enough to be fast, large enough to be representative */
const QUANTIZE_SIZE = 48;
/** Number of buckets for color quantization */
const NUM_BUCKETS = 16;
/** Minimum number of palette entries to return */
const MIN_ENTRIES = 5;
/** Maximum number of palette entries to return */
const MAX_ENTRIES = 8;

// ── Quantization ─────────────────────────────────────────────────────

/**
 * Quantize an array of pixels into a set of dominant color buckets.
 * Uses a simple but effective approach: reduce each channel to a few
 * bits, group identical reduced colors, then sort by population.
 */
function quantizePixels(
  pixels: Uint8ClampedArray,
  bitsPerChannel = 4,
): PixelBucket[] {
  const shift = 8 - bitsPerChannel;
  const mask = (0xff >> shift) << shift;
  const buckets = new Map<number, PixelBucket>();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]! & mask;
    const g = pixels[i + 1]! & mask;
    const b = pixels[i + 2]! & mask;
    // Skip fully transparent pixels
    if (pixels[i + 3]! < 128) continue;

    const key = (r << 16) | (g << 8) | b;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  // Compute average color per bucket and sort by population
  return Array.from(buckets.values())
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Select a diverse palette from quantized buckets.
 * Ensures we get dominant, light, dark, and accent colors rather than
 * just the most populous shades.
 */
function selectDiversePalette(buckets: PixelBucket[]): MediaPaletteEntry[] {
  if (buckets.length === 0) return [];

  const totalPixels = buckets.reduce((sum, b) => sum + b.count, 0);
  const entries: MediaPaletteEntry[] = [];

  // Helper to check if a color is too similar to already-selected entries
  const isTooSimilar = (r: number, g: number, b: number, threshold = 30): boolean => {
    return entries.some((e) => {
      const dr = Math.round(e.color.r * 255) - r;
      const dg = Math.round(e.color.g * 255) - g;
      const db = Math.round(e.color.b * 255) - b;
      return Math.sqrt(dr * dr + dg * dg + db * db) < threshold;
    });
  };

  // 1. Dominant color (most populous)
  const dominant = buckets[0]!;
  entries.push({
    color: normalize(rgb255(dominant.r, dominant.g, dominant.b)),
    weight: dominant.count / totalPixels,
  });

  // 2. Lightest color
  const lightest = [...buckets]
    .sort((a, b) => (b.r + b.g + b.b) - (a.r + a.g + a.b))[0];
  if (lightest && !isTooSimilar(lightest.r, lightest.g, lightest.b, 40)) {
    entries.push({
      color: normalize(rgb255(lightest.r, lightest.g, lightest.b)),
      weight: lightest.count / totalPixels,
    });
  }

  // 3. Darkest color
  const darkest = [...buckets]
    .sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b))[0];
  if (darkest && !isTooSimilar(darkest.r, darkest.g, darkest.b, 40)) {
    entries.push({
      color: normalize(rgb255(darkest.r, darkest.g, darkest.b)),
      weight: darkest.count / totalPixels,
    });
  }

  // 4-8. Remaining buckets by population, skipping similar colors
  for (const bucket of buckets) {
    if (entries.length >= MAX_ENTRIES) break;
    if (isTooSimilar(bucket.r, bucket.g, bucket.b, 35)) continue;
    entries.push({
      color: normalize(rgb255(bucket.r, bucket.g, bucket.b)),
      weight: bucket.count / totalPixels,
    });
  }

  // Pad with neutral if we don't have enough
  if (entries.length < MIN_ENTRIES) {
    const neutralR = 128, neutralG = 128, neutralB = 128;
    if (!isTooSimilar(neutralR, neutralG, neutralB, 20)) {
      entries.push({
        color: normalize(rgb255(neutralR, neutralG, neutralB)),
        weight: 0,
      });
    }
  }

  return entries.slice(0, MAX_ENTRIES);
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Extract 5-8 dominant colors from an image URI.
 *
 * Uses expo-image-manipulator to downscale to a small thumbnail, then
 * reads pixel data via Skia's readPixels API (same pattern as
 * AutoAdjust.ts). Falls back to a neutral palette if Skia is unavailable.
 *
 * @param imageUri - local file:// or remote http(s):// URI
 * @returns array of MediaPaletteEntry (color + weight), or empty array on failure
 */
export async function extractMediaPalette(
  imageUri: string,
): Promise<MediaPaletteEntry[]> {
  if (!skiaAvailable || !SkiaModule) {
    return fallbackPalette();
  }

  try {
    // 1. Downscale to a small thumbnail via expo-image-manipulator
    const context = ImageManipulator.manipulate(imageUri);
    context.resize({ width: QUANTIZE_SIZE, height: QUANTIZE_SIZE });
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: SaveFormat.PNG,
      base64: false,
    });
    context.release();
    rendered.release();

    // 2. Load the resized image into Skia
    const data = await SkiaModule.Data.fromURI(result.uri);
    const skImage = SkiaModule.Image.MakeImageFromEncoded(data);
    if (!skImage) return fallbackPalette();

    // 3. Read raw pixel data
    const info = skImage.getImageInfo();
    const pixels = skImage.readPixels(0, 0, info);
    if (!pixels || !(pixels instanceof Uint8Array) || pixels.length === 0) {
      return fallbackPalette();
    }

    // 4. Quantize and select diverse palette
    const pixelArray = new Uint8ClampedArray(pixels);
    const buckets = quantizePixels(pixelArray, 4);
    const palette = selectDiversePalette(buckets);
    return palette.length > 0 ? palette : fallbackPalette();
  } catch {
    return fallbackPalette();
  }
}

/**
 * Fallback palette generator — produces a neutral palette when image
 * extraction fails or is unavailable. Useful for testing and as a
 * graceful degradation path.
 */
export function fallbackPalette(): MediaPaletteEntry[] {
  return [
    { color: normalize(rgb255(60, 60, 60)), weight: 0.3 },
    { color: normalize(rgb255(120, 120, 120)), weight: 0.2 },
    { color: normalize(rgb255(180, 180, 180)), weight: 0.15 },
    { color: normalize(rgb255(220, 220, 220)), weight: 0.1 },
    { color: normalize(rgb255(30, 30, 30)), weight: 0.1 },
    { color: normalize(rgb255(200, 164, 106)), weight: 0.05 },
  ];
}
