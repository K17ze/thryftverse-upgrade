/**
 * filterConfig — filter types, ColorMatrix data, and resolution helpers.
 *
 * Extracted from the original FilterStrip.tsx as part of the shared-abstraction
 * split. Contains the 10 flagship named filters with GPU-accelerated Skia
 * ColorMatrix definitions, plus the intensity-interpolation helpers used by
 * both the filter strip UI and the canvas renderer.
 *
 * @module filterConfig
 */

// ── Filter types ───────────────────────────────────────────────────
// The union includes the 10 flagship named filters while retaining legacy
// names as aliases so callers do not break.
export type ImageFilter =
  | 'normal'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'bw'
  | 'cinematic'
  | 'fade'
  | 'vivid'
  | 'noir'
  | 'golden'
  // Legacy aliases (kept for backward compatibility)
  | 'clarendon'
  | 'gingham'
  | 'moon'
  | 'lark'
  | 'reyes'
  | 'juno'
  | 'slumber'
  | 'crema'
  | 'ludwig'
  | 'aden'
  | 'perpetua';

/**
 * Real filter effect definition.
 *
 * Each numeric field is expressed as a *delta* from the neutral value so the
 * intensity slider can interpolate linearly from "no effect" (0%) to the full
 * effect (100%):
 *   - brightness: percentage delta (e.g. +5 → brightness 1.05 at 100%)
 *   - contrast:   percentage delta (e.g. +10 → contrast 1.10 at 100%)
 *   - saturation: percentage delta (e.g. -100 → saturate(0) at 100%)
 *   - warmth:     color overlay strength (-100..100); positive = warm, negative = cool
 *   - vignette:   0..1 strength of radial darkening overlay
 */
export interface FilterEffect {
  brightness?: number; // delta percentage
  contrast?: number; // delta percentage
  saturation?: number; // delta percentage
  warmth?: number; // -100..100
  vignette?: number; // 0..1
}

export interface FilterConfig {
  name: ImageFilter;
  label: string;
  /** Legacy overlay color (still honoured by getFilterOverlay for backwards compat) */
  overlayColor?: string;
  overlayOpacity?: number;
  /** Legacy scalar fields (kept for backwards compat) */
  saturation?: number;
  brightness?: number;
  contrast?: number;
  /** New flagship real-effect definition */
  effect?: FilterEffect;
  /**
   * Skia ColorMatrix — 4x5 row-major array of 20 floats for GPU-accelerated
   * filter processing. Represents the full filter effect at intensity 1.
   * At intensity 0 the identity matrix is used (original image).
   *
   * Format: [R', G', B', A', offset] per row
   *   R' = R*m[0] + G*m[1] + B*m[2] + A*m[3] + m[4]
   */
  colorMatrix?: number[];
}

// ── Skia ColorMatrix constants ─────────────────────────────────────
// 4x5 row-major color matrix (20 floats) for GPU-accelerated processing.
// Format: [R', G', B', A', offset] per row
//   R' = R*m[0] + G*m[1] + B*m[2] + A*m[3] + m[4]

/** Identity matrix — no effect (original image at intensity 0). */
export const IDENTITY_MATRIX: number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Interpolate between the identity matrix and a filter's target matrix
 * by intensity (0..1). At intensity 0 the result is identity (original),
 * at intensity 1 the result is the full filter effect.
 *
 * Formula: matrix[i] = identity[i] + (target[i] - identity[i]) * intensity
 */
export function interpolateColorMatrix(
  target: number[],
  intensity: number
): number[] {
  const t = Math.max(0, Math.min(1, intensity));
  return IDENTITY_MATRIX.map((id, i) => id + (target[i] - id) * t);
}

/**
 * Resolve a filter + intensity into a 20-float Skia ColorMatrix.
 * Uses GPU-accelerated color matrix processing instead of CSS filters.
 */
export function resolveColorMatrix(
  filter: ImageFilter,
  intensity: number
): number[] {
  const config = FILTERS.find((f) => f.name === filter);
  if (!config || !config.colorMatrix) return IDENTITY_MATRIX;
  return interpolateColorMatrix(config.colorMatrix, intensity);
}

// ── 10 flagship named filters ──────────────────────────────────────
export const FILTERS: FilterConfig[] = [
  {
    name: 'normal',
    label: 'Normal',
    effect: {},
    colorMatrix: IDENTITY_MATRIX,
  },
  {
    name: 'warm',
    label: 'Warm',
    effect: { warmth: 20, saturation: 10 },
    // Increase R, decrease B, slight G lift — warm orange tone
    colorMatrix: [
      1.12, 0, 0, 0, 0.02,
      0, 1.02, 0, 0, 0,
      0, 0, 0.88, 0, -0.02,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'cool',
    label: 'Cool',
    effect: { warmth: -20, saturation: 10 },
    // Increase B, decrease R — cool blue tone
    colorMatrix: [
      0.88, 0, 0, 0, -0.02,
      0, 1.02, 0, 0, 0,
      0, 0, 1.12, 0, 0.02,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'vintage',
    label: 'Vintage',
    effect: { contrast: -10, warmth: 15, saturation: -20, vignette: 0.3 },
    // Sepia-blended with identity (~70%) + reduced saturation
    colorMatrix: [
      0.575, 0.538, 0.132, 0, 0,
      0.544, 0.480, 0.118, 0, 0,
      0.390, 0.374, 0.092, 0, 0,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'bw',
    label: 'B&W',
    effect: { saturation: -100, contrast: 10 },
    // Grayscale (luminance weights) + slight contrast boost
    colorMatrix: [
      0.329, 0.646, 0.125, 0, -0.05,
      0.329, 0.646, 0.125, 0, -0.05,
      0.329, 0.646, 0.125, 0, -0.05,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'cinematic',
    label: 'Cinematic',
    effect: { contrast: 15, saturation: -5, warmth: -5, vignette: 0.2 },
    // High contrast + slight cool tint in shadows
    colorMatrix: [
      1.15, 0, 0, 0, -0.075,
      0, 1.15, 0, 0, -0.075,
      0, 0, 1.20, 0, -0.10,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'fade',
    label: 'Fade',
    effect: { contrast: -15, saturation: -10, brightness: 5 },
    // Reduced contrast + desaturated + lifted blacks
    colorMatrix: [
      0.82, 0.08, 0.08, 0, 0.06,
      0.08, 0.82, 0.08, 0, 0.06,
      0.08, 0.08, 0.82, 0, 0.06,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'vivid',
    label: 'Vivid',
    effect: { saturation: 25, contrast: 10 },
    // High saturation (s≈1.3) + contrast boost (1.1)
    colorMatrix: [
      1.331, -0.194, -0.038, 0, -0.05,
      -0.099, 1.236, -0.038, 0, -0.05,
      -0.099, -0.194, 1.392, 0, -0.05,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'noir',
    label: 'Noir',
    effect: { saturation: -100, contrast: 25, vignette: 0.4 },
    // High-contrast grayscale — deep blacks, bright whites
    colorMatrix: [
      0.389, 0.763, 0.148, 0, -0.15,
      0.389, 0.763, 0.148, 0, -0.15,
      0.389, 0.763, 0.148, 0, -0.15,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'golden',
    label: 'Golden',
    effect: { warmth: 25, brightness: 5, saturation: 10 },
    // Warm golden tone + slight saturation + brightness lift
    colorMatrix: [
      1.15, 0.05, 0, 0, 0.03,
      0.05, 1.05, 0.02, 0, 0.01,
      0, 0.02, 0.82, 0, -0.02,
      0, 0, 0, 1, 0,
    ],
  },
];

// ── Filter effect computation ──────────────────────────────────────
/**
 * Resolve a FilterConfig + intensity (0..1) into concrete CSS-filter values
 * and overlay parameters that can be applied to an Image / View.
 *
 * Intensity interpolates every delta linearly from the neutral value so the
 * slider feels continuous and predictable.
 */
export interface ResolvedFilter {
  brightness: number; // multiplier, 1 = neutral
  contrast: number; // multiplier, 1 = neutral
  saturation: number; // multiplier, 1 = neutral
  warmthColor: string | null; // overlay color for warmth
  warmthOpacity: number; // 0..1
  vignetteOpacity: number; // 0..1
  /** GPU-accelerated Skia ColorMatrix (20 floats, 4x5 row-major) */
  colorMatrix: number[];
}

const NEUTRAL: ResolvedFilter = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmthColor: null,
  warmthOpacity: 0,
  vignetteOpacity: 0,
  colorMatrix: IDENTITY_MATRIX,
};

export function resolveFilter(filter: ImageFilter, intensity: number): ResolvedFilter {
  const config = FILTERS.find((f) => f.name === filter);
  if (!config || !config.effect) return { ...NEUTRAL, colorMatrix: resolveColorMatrix(filter, intensity) };
  const e = config.effect;
  const t = Math.max(0, Math.min(1, intensity));

  const brightness = 1 + (e.brightness ?? 0) / 100 * t;
  const contrast = 1 + (e.contrast ?? 0) / 100 * t;
  const saturation = 1 + (e.saturation ?? 0) / 100 * t;

  // Warmth: positive → warm orange overlay, negative → cool blue overlay
  const warmth = e.warmth ?? 0;
  let warmthColor: string | null = null;
  let warmthOpacity = 0;
  if (warmth !== 0) {
    warmthColor = warmth > 0 ? '#ff7a3c' : '#3c7aff';
    warmthOpacity = (Math.abs(warmth) / 100) * 0.5 * t;
  }

  const vignetteOpacity = (e.vignette ?? 0) * t;

  // GPU-accelerated Skia ColorMatrix — interpolated by intensity
  const colorMatrix = resolveColorMatrix(filter, intensity);

  return { brightness, contrast, saturation, warmthColor, warmthOpacity, vignetteOpacity, colorMatrix };
}

/**
 * @deprecated Filter previews now use GPU-accelerated Skia ColorMatrix
 * via the `colorMatrix` field on `ResolvedFilter`. This function is kept
 * for backwards compatibility but no longer generates CSS filter strings.
 * Use `resolveColorMatrix()` + Skia `<ColorMatrix>` instead.
 */
export function filterStyleString(_r: ResolvedFilter): string | undefined {
  return undefined;
}

// ── Legacy helper (preserved for backwards compatibility) ──────────
export function getFilterOverlay(filter: ImageFilter): { color?: string; opacity: number } {
  const config = FILTERS.find((f) => f.name === filter);
  if (!config || !config.overlayColor) return { opacity: 0 };
  return { color: config.overlayColor, opacity: config.overlayOpacity ?? 0.15 };
}
