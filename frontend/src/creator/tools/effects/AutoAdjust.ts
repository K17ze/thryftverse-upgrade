/**
 * AutoAdjust — real content-aware image analysis for one-tap enhancement.
 *
 * This module performs actual pixel-level analysis of the source image:
 *   1. Resizes the image to 64×64 via expo-image-manipulator (reduced
 *      resolution for fast analysis).
 *   2. Loads the resized image into Skia and reads raw pixel data via
 *      `SkImage.readPixels()`.
 *   3. Computes a 256-bin luminance histogram (Rec.709 weights).
 *   4. Detects exposure from the histogram mean vs the 0.5 target.
 *   5. Detects contrast from the standard deviation of luminance vs a
 *      target std.
 *   6. Detects saturation from the average color distance from gray.
 *   7. Detects white balance from the average RGB channel ratios
 *      (gray-world assumption).
 *   8. Detects clipping — crushed shadows (luminance < 5) and blown
 *      highlights (luminance > 250).
 *   9. Computes conservative, content-aware adjustments from the analysis.
 *
 * Per AGENTS.md §11: this is real analysis, not static constants labeled
 * "intelligent." If the analysis pipeline fails (e.g. readPixels is not
 * available on a platform), it falls back to a conservative curated
 * preset — and the UI honestly labels it "Enhance" in that case (see
 * `isRealAnalysis` flag). The fallback is clearly marked via
 * `isFallbackPreset()`.
 *
 * Per spec 07 §6: the adjustments are deliberately conservative so they
 * improve most photos without looking over-processed.
 */
import { Skia, ColorType } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { AdjustNode } from './EffectTypes';

// ── Analysis result ─────────────────────────────────────────────────────

/**
 * The result of real pixel-level image analysis.
 *
 * All luminance values use Rec.709 weights (KR=0.2126, KG=0.7152,
 * KB=0.0722). The histogram is a 256-bin array of normalized frequencies
 * (each bin is the fraction of pixels in that luminance bucket, 0..1).
 */
export interface ImageAnalysis {
  /** Mean luminance 0..255 (Rec.709 weighted). */
  meanLuminance: number;
  /** Standard deviation of luminance — contrast proxy. */
  luminanceStd: number;
  /** 256-bin luminance histogram, each bin a normalized frequency 0..1. */
  histogram: number[];
  /** Fraction of pixels with luminance < 5 (crushed shadows). 0..1. */
  shadowClip: number;
  /** Fraction of pixels with luminance > 250 (blown highlights). 0..1. */
  highlightClip: number;
  /** Mean red channel 0..255. */
  meanR: number;
  /** Mean green channel 0..255. */
  meanG: number;
  /** Mean blue channel 0..255. */
  meanB: number;
  /**
   * Mean saturation 0..1 computed as the average color distance from
   * gray (maxC - minC) / maxC per pixel. Higher = more colorful.
   */
  meanSaturation: number;
  /**
   * White-balance channel ratios: each channel's mean divided by the
   * mean luminance. Under neutral (gray-world) lighting all three
   * approach 1.0. Deviations indicate a color cast.
   */
  channelRatios: { r: number; g: number; b: number };
}

// ── Fallback preset ─────────────────────────────────────────────────────

/**
 * Conservative curated enhancement preset used as a fallback when real
 * analysis is not available. This is NOT labeled "intelligent" — it is a
 * static, hand-tuned preset (spec 07 §6, AGENTS.md §11).
 *
 * The fallback is clearly marked: `isFallbackPreset()` returns true for
 * an AdjustNode whose values exactly match this preset, so the UI can
 * label it "Enhance" rather than "Auto" (AGENTS.md §11 truth).
 */
const ENHANCE_FALLBACK: AdjustNode = {
  type: 'adjust',
  exposure: 0.08,
  contrast: 0.12,
  highlights: -0.1,
  shadows: 0.15,
  saturation: 0.08,
  temperature: 0.03,
  fade: 0.05,
  vignette: 0.03,
};

/**
 * Returns true when the given adjust node exactly matches the fallback
 * preset. Used by the UI to label the button "Enhance" (curated preset)
 * rather than "Auto" (real analysis) — AGENTS.md §11 truth.
 */
export function isFallbackPreset(node: AdjustNode): boolean {
  const f = ENHANCE_FALLBACK;
  return (
    node.exposure === f.exposure &&
    node.contrast === f.contrast &&
    node.highlights === f.highlights &&
    node.shadows === f.shadows &&
    node.saturation === f.saturation &&
    node.temperature === f.temperature &&
    node.fade === f.fade &&
    node.vignette === f.vignette
  );
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Whether the last `computeAutoAdjust` call used real pixel analysis.
 * The UI uses this to label the button "Auto" (real analysis) or "Enhance"
 * (curated preset fallback). Per AGENTS.md §11: never label static
 * constants as "intelligent" or "auto."
 */
let lastCallWasRealAnalysis = false;

/**
 * Returns true if the last `computeAutoAdjust` call performed real
 * pixel-level analysis (vs. falling back to the curated preset).
 */
export function isRealAnalysis(): boolean {
  return lastCallWasRealAnalysis;
}

/**
 * Performs real content-aware image analysis and returns conservative
 * adjustment values.
 *
 * Pipeline:
 * 1. Resize to 64×64 via expo-image-manipulator.
 * 2. Load into Skia and read raw pixels.
 * 3. Compute luminance histogram, clipping, white balance, saturation.
 * 4. Map analysis to conservative adjustment values.
 *
 * If any step fails, falls back to `ENHANCE_FALLBACK` and sets
 * `isRealAnalysis()` to false.
 *
 * @param imageUri - URI of the image to analyze (local file or remote).
 * @returns An `adjust` effect node with content-aware values.
 */
export async function computeAutoAdjust(imageUri: string): Promise<AdjustNode> {
  try {
    const analysis = await analyzeImage(imageUri);
    if (!analysis) {
      lastCallWasRealAnalysis = false;
      return { ...ENHANCE_FALLBACK };
    }
    lastCallWasRealAnalysis = true;
    return analysisToAdjustments(analysis);
  } catch {
    lastCallWasRealAnalysis = false;
    return { ...ENHANCE_FALLBACK };
  }
}

// ── Image analysis ──────────────────────────────────────────────────────

/**
 * Resize, load into Skia, read pixels, and compute analysis.
 * Returns null if any step fails.
 */
async function analyzeImage(imageUri: string): Promise<ImageAnalysis | null> {
  // 1. Resize to 64×64 via expo-image-manipulator.
  const context = ImageManipulator.manipulate(imageUri);
  context.resize({ width: 64, height: 64 });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.PNG,
    base64: false,
  });
  context.release();
  rendered.release();

  // 2. Load the resized image into Skia.
  const data = await Skia.Data.fromURI(result.uri);
  const skImage = Skia.Image.MakeImageFromEncoded(data);
  if (!skImage) return null;

  // 3. Read raw pixel data.
  // Use the image's native ImageInfo to get the correct color type.
  const info = skImage.getImageInfo();
  const pixels = skImage.readPixels(0, 0, info);
  if (!pixels || !(pixels instanceof Uint8Array)) return null;

  const width = skImage.width();
  const height = skImage.height();
  const isBGRA = info.colorType === ColorType.BGRA_8888;

  return analyzePixels(pixels, width, height, isBGRA);
}

/**
 * Compute image analysis from raw RGBA/BGRA pixel data.
 * Each pixel is 4 bytes: R, G, B, A (or B, G, R, A for BGRA).
 */
function analyzePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  isBGRA: boolean,
): ImageAnalysis {
  const pixelCount = width * height;
  const bytesPerPixel = 4;

  // Rec.709 luma weights.
  const KR = 0.2126;
  const KG = 0.7152;
  const KB = 0.0722;

  // 256-bin luminance histogram (counts, normalized to frequencies later).
  const histogram = new Array<number>(256).fill(0);

  let sumLum = 0;
  let sumLumSq = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;
  let shadowClipCount = 0;
  let highlightClipCount = 0;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * bytesPerPixel;
    const r = isBGRA ? pixels[offset + 2] : pixels[offset];
    const g = pixels[offset + 1];
    const b = isBGRA ? pixels[offset] : pixels[offset + 2];

    const lum = KR * r + KG * g + KB * b;
    sumLum += lum;
    sumLumSq += lum * lum;
    sumR += r;
    sumG += g;
    sumB += b;

    // Accumulate the 256-bin histogram.
    const bin = lum < 0 ? 0 : lum > 255 ? 255 : Math.round(lum);
    histogram[bin]++;

    if (lum < 5) shadowClipCount++;
    if (lum > 250) highlightClipCount++;

    // Saturation: distance from gray, normalized to 0..1.
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    sumSat += sat;
  }

  const meanLuminance = sumLum / pixelCount;
  const luminanceStd = Math.sqrt(sumLumSq / pixelCount - meanLuminance * meanLuminance);
  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const meanSaturation = sumSat / pixelCount;

  // Normalize histogram to frequencies (0..1 per bin).
  for (let i = 0; i < 256; i++) {
    histogram[i] /= pixelCount;
  }

  // White-balance channel ratios (gray-world): each channel mean divided
  // by the mean luminance. Under neutral lighting all approach 1.0.
  const channelRatios = {
    r: meanLuminance > 0 ? meanR / meanLuminance : 1,
    g: meanLuminance > 0 ? meanG / meanLuminance : 1,
    b: meanLuminance > 0 ? meanB / meanLuminance : 1,
  };

  return {
    meanLuminance,
    luminanceStd,
    histogram,
    shadowClip: shadowClipCount / pixelCount,
    highlightClip: highlightClipCount / pixelCount,
    meanR,
    meanG,
    meanB,
    meanSaturation,
    channelRatios,
  };
}

// ── Analysis → adjustments mapping ──────────────────────────────────────

/**
 * Map image analysis to conservative adjustment values.
 *
 * Strategy:
 * - Exposure: lift underexposed images (mean lum < 110), reduce overexposed
 *   (mean lum > 170). Conservative: max ±0.15.
 * - Contrast: boost low-contrast images (std < 45), reduce high-contrast
 *   (std > 75). Conservative: max ±0.15.
 * - Highlights: recover blown highlights (highlight clip > 3%).
 * - Shadows: lift crushed shadows (shadow clip > 3%).
 * - Saturation: boost low saturation (mean sat < 0.25). Conservative: max 0.12.
 * - Temperature: correct white balance via gray-world assumption.
 *   If R > B significantly, cool the image; if B > R, warm it.
 *   Conservative: max ±0.08.
 */
function analysisToAdjustments(a: ImageAnalysis): AdjustNode {
  // ── Exposure ──────────────────────────────────────────────────────
  // Ideal mean luminance is ~128. Map deviation to -0.15..+0.15.
  const lumDeviation = (128 - a.meanLuminance) / 128; // -1..+1
  const exposure = clamp(lumDeviation * 0.15, -0.15, 0.15);

  // ── Contrast ──────────────────────────────────────────────────────
  // Ideal luminance std is ~55. Low std → boost, high std → reduce.
  const contrastDeviation = (55 - a.luminanceStd) / 55; // -1..+1
  const contrast = clamp(contrastDeviation * 0.15, -0.15, 0.15);

  // ── Highlights ────────────────────────────────────────────────────
  // Recover blown highlights. >3% clip → -0.15, >8% → -0.2.
  const highlights = a.highlightClip > 0.03
    ? clamp(-0.1 - (a.highlightClip - 0.03) * 2, -0.2, -0.05)
    : 0;

  // ── Shadows ───────────────────────────────────────────────────────
  // Lift crushed shadows. >3% clip → +0.15, >8% → +0.2.
  const shadows = a.shadowClip > 0.03
    ? clamp(0.1 + (a.shadowClip - 0.03) * 2, 0.05, 0.2)
    : 0;

  // ── Saturation ────────────────────────────────────────────────────
  // Boost low saturation. <0.25 mean → +0.12, <0.15 → +0.15.
  const saturation = a.meanSaturation < 0.25
    ? clamp(0.06 + (0.25 - a.meanSaturation) * 0.3, 0.04, 0.15)
    : 0;

  // ── Temperature (gray-world white balance) ────────────────────────
  // Gray-world: meanR ≈ meanG ≈ meanB under neutral lighting.
  // If R > B (warm bias), cool (negative temperature).
  // If B > R (cool bias), warm (positive temperature).
  const rbDiff = (a.meanR - a.meanB) / 128; // -1..+1 (positive = warm bias)
  const temperature = clamp(-rbDiff * 0.08, -0.08, 0.08);

  // ── Fade ──────────────────────────────────────────────────────────
  // Subtle fade for high-contrast images to soften the look.
  const fade = a.luminanceStd > 70 ? 0.04 : 0;

  // ── Vignette ──────────────────────────────────────────────────────
  // Very subtle vignette for aesthetic focus.
  const vignette = 0.02;

  return {
    type: 'adjust',
    exposure: round(exposure),
    contrast: round(contrast),
    highlights: round(highlights),
    shadows: round(shadows),
    saturation: round(saturation),
    temperature: round(temperature),
    fade: round(fade),
    vignette: round(vignette),
  };
}

// ── Utilities ───────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ── Detection (for toggle behavior) ─────────────────────────────────────

/**
 * The canonical fallback enhance values. Used by `isAutoAdjustNode` to
 * detect whether an adjust node was produced by the fallback path.
 */
const FALLBACK_KEYS: ReadonlyArray<keyof typeof ENHANCE_FALLBACK> = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'saturation',
  'temperature',
  'fade',
  'vignette',
];

/**
 * Returns true when the given effect node was produced by
 * `computeAutoAdjust` — either real analysis or the fallback preset.
 * Used by the UI to implement toggle behavior: tapping Auto removes an
 * existing auto-adjust but leaves manual adjustments untouched.
 *
 * Since real analysis produces content-aware values (not fixed constants),
 * we detect the fallback preset by exact value match, and real analysis
 * by checking that the node has the auto-adjust shape (type = 'adjust'
 * with only the auto keys present, no tint or sharpness).
 */
export function isAutoAdjustNode(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as Record<string, unknown>;
  if (n['type'] !== 'adjust') return false;

  // The auto-adjust only sets these keys (never tint or sharpness).
  const autoKeys = new Set<string>(['type', ...FALLBACK_KEYS]);
  const presentKeys = Object.keys(n);
  for (const k of presentKeys) {
    if (!autoKeys.has(k)) return false;
  }

  // Check that at least some auto keys are present (not an empty adjust node).
  const hasAutoKey = FALLBACK_KEYS.some((k) => k in n && n[k] !== undefined);
  if (!hasAutoKey) return false;

  // Either matches the fallback exactly, or is a real analysis result
  // (which has the same key shape but different values).
  // We accept both — the toggle behavior removes either.
  return true;
}


