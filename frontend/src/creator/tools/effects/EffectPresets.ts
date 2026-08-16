/**
 * Real filter presets for the creator effect system.
 *
 * Each preset is built from actual 4×5 color matrices (20 numbers) that Skia
 * renders on the GPU — no CSS filter strings. The matrices are composed from
 * fundamental operations (brightness, contrast, saturation, temperature,
 * sepia, grayscale) using matrix multiplication, producing visually distinct,
 * production-grade looks.
 *
 * Per spec 07 §2: a preset contains actual render data, not a CSS label.
 * Per AGENTS.md §11: no CSS filter hack remains in the production path.
 *
 * Matrix format (row-major 4×5, Skia convention):
 *   R' = R*m[0]  + G*m[1]  + B*m[2]  + A*m[3]  + m[4]
 *   G' = R*m[5]  + G*m[6]  + B*m[7]  + A*m[8]  + m[9]
 *   B' = R*m[10] + G*m[11] + B*m[12] + A*m[13] + m[14]
 *   A' = R*m[15] + G*m[16] + B*m[17] + A*m[18] + m[19]
 */
import type { EffectPreset, EffectPresetCategory } from './EffectTypes';

// ── Matrix helpers ──────────────────────────────────────────────────────

/**
 * Compose two 4×5 color matrices: result = outer(inner(x)).
 * Treats each 4×5 matrix as an augmented 5×5 with last row [0,0,0,0,1].
 */
function composeMatrices(outer: readonly number[], inner: readonly number[]): number[] {
  const result = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 5; k++) {
        const outerVal = outer[row * 5 + k];
        const innerVal = k < 4 ? inner[k * 5 + col] : col === 4 ? 1 : 0;
        sum += outerVal * innerVal;
      }
      result[row * 5 + col] = sum;
    }
  }
  return result;
}

/** Compose multiple matrices left-to-right (first applied first). */
function composeAll(...matrices: number[][]): number[] {
  if (matrices.length === 0) return [...IDENTITY];
  return matrices.reduce((acc, m) => composeMatrices(acc, m));
}

// ── Fundamental operation matrices ───────────────────────────────────────

const IDENTITY = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Brightness matrix — adds `b` to all RGB channels (linear, -1..1).
 * Note: true exposure is exponential (pow(2, value)), but for preset looks
 * a linear brightness approximation is sufficient and matrix-compatible.
 */
function brightness(b: number): number[] {
  return [
    1, 0, 0, 0, b,
    0, 1, 0, 0, b,
    0, 0, 1, 0, b,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Contrast matrix — scales around 0.5 midpoint (factor > 1 = more contrast).
 */
function contrast(c: number): number[] {
  return [
    c, 0, 0, 0, 0.5 * (1 - c),
    0, c, 0, 0, 0.5 * (1 - c),
    0, 0, c, 0, 0.5 * (1 - c),
    0, 0, 0, 1, 0,
  ];
}

/**
 * Saturation matrix — uses Rec.709 luma coefficients (Skia convention:
 * kR=0.213, kG=0.715, kB=0.072). `s` = 1 is identity, 0 is grayscale,
 * > 1 is more saturated.
 */
function saturation(s: number): number[] {
  const sr = 0.213 * (1 - s);
  const sg = 0.715 * (1 - s);
  const sb = 0.072 * (1 - s);
  return [
    sr + s, sg,      sb,      0, 0,
    sr,     sg + s,  sb,      0, 0,
    sr,     sg,      sb + s,  0, 0,
    0,      0,       0,       1, 0,
  ];
}

/**
 * Temperature matrix — shifts warm (positive) or cool (negative).
 * Positive: increases R, decreases B. Negative: decreases R, increases B.
 */
function temperature(t: number): number[] {
  return [
    1 + t, 0, 0,      0, 0,
    0,     1, 0,      0, 0,
    0,     0, 1 - t,  0, 0,
    0,     0, 0,      1, 0,
  ];
}

/**
 * Tint matrix — shifts green (positive) or magenta (negative).
 */
function tint(t: number): number[] {
  return [
    1 + t * 0.5, 0, 0,          0, 0,
    0,           1 + t,         0, 0, 0,
    0,           0,      1 + t * 0.5, 0, 0,
    0,           0,      0,           1, 0,
  ];
}

/**
 * Sepia matrix — classic sepia tone transform.
 * Source: Microsoft / W3C sepia reference values.
 */
function sepiaMatrix(amount: number): number[] {
  const full = [
    0.393, 0.769, 0.189, 0, 0,
    0.349, 0.686, 0.168, 0, 0,
    0.272, 0.534, 0.131, 0, 0,
    0,     0,     0,     1, 0,
  ];
  if (amount >= 1) return full;
  // Blend between identity and full sepia
  return full.map((v, i) => IDENTITY[i] + (v - IDENTITY[i]) * amount);
}

/**
 * Grayscale matrix — Rec.709 luma weights.
 */
function grayscaleMatrix(): number[] {
  return [
    0.213, 0.715, 0.072, 0, 0,
    0.213, 0.715, 0.072, 0, 0,
    0.213, 0.715, 0.072, 0, 0,
    0,     0,     0,     1, 0,
  ];
}

/**
 * Channel scale — independently scale R, G, B channels.
 */
function channelScale(rs: number, gs: number, bs: number): number[] {
  return [
    rs, 0,  0,  0, 0,
    0,  gs, 0,  0, 0,
    0,  0,  bs, 0, 0,
    0,  0,  0,  1, 0,
  ];
}

// ── Preset definitions ──────────────────────────────────────────────────

/** Bump this when any preset's render data changes (invalidates thumbnail caches). */
const PRESET_VERSION = 2;

function makePreset(
  id: string,
  name: string,
  category: EffectPresetCategory,
  matrix: number[],
): EffectPreset {
  return {
    id,
    name,
    category,
    nodes: [{ type: 'matrix', matrix }],
    intensity: 1,
    thumbnailMatrix: matrix,
    version: PRESET_VERSION,
  };
}

// 1. Original — identity (no effect)
const originalMatrix = [...IDENTITY];

// 2. Warm — increase R, decrease B, slight saturation & brightness boost
const warmMatrix = composeAll(
  saturation(1.15),
  temperature(0.08),
  brightness(0.02),
);

// 3. Cool — increase B, decrease R, slight desaturation
const coolMatrix = composeAll(
  saturation(0.95),
  temperature(-0.08),
  brightness(0.01),
);

// 4. Vivid — strong saturation boost, slight contrast
const vividMatrix = composeAll(
  saturation(1.35),
  contrast(1.08),
);

// 5. Vintage — sepia blend, reduced saturation, warm, slight contrast boost
const vintageMatrix = composeAll(
  sepiaMatrix(0.6),
  saturation(0.8),
  temperature(0.06),
  contrast(1.05),
  brightness(0.02),
);

// 6. Mono — grayscale (Rec.709 luma)
const monoMatrix = grayscaleMatrix();

// 7. Noir — high-contrast grayscale
const noirMatrix = composeAll(
  grayscaleMatrix(),
  contrast(1.35),
  brightness(-0.02),
);

// 8. Fade — lifted blacks (additive), reduced contrast, slight desaturation
const fadeMatrix = composeAll(
  brightness(0.06),
  contrast(0.82),
  saturation(0.85),
);

// 9. Dramatic — high contrast, slightly desaturated, slight cool tint
const dramaticMatrix = composeAll(
  contrast(1.25),
  saturation(0.88),
  temperature(-0.03),
  brightness(-0.02),
);

// 10. Soft — reduced contrast, slight warmth, slight desaturation
const softMatrix = composeAll(
  contrast(0.9),
  saturation(0.92),
  temperature(0.04),
  brightness(0.03),
);

// 11. Golden — warm highlights (R boost), cool shadows (B slight boost),
//     approximated as a warm matrix with green lift for golden feel
const goldenMatrix = composeAll(
  channelScale(1.12, 1.04, 0.92),
  saturation(1.1),
  brightness(0.03),
);

// 12. Forest — boost green, warm midtones, slight contrast
const forestMatrix = composeAll(
  channelScale(0.98, 1.15, 0.95),
  saturation(1.12),
  temperature(0.03),
  contrast(1.05),
);

// 13. Crimson — warm red boost, slight contrast, reduced blue
const crimsonMatrix = composeAll(
  channelScale(1.15, 0.98, 0.88),
  saturation(1.18),
  contrast(1.06),
);

// 14. Azure — strong cool, boosted blue, slight contrast
const azureMatrix = composeAll(
  channelScale(0.9, 0.98, 1.15),
  saturation(1.1),
  temperature(-0.06),
  contrast(1.05),
);

/**
 * The canonical filter preset list. "Original" is always first.
 * Each preset carries a real 4×5 color matrix that Skia renders on the GPU.
 */
export const FILTER_PRESETS: EffectPreset[] = [
  makePreset('original', 'Original', 'original', originalMatrix),
  makePreset('warm', 'Warm', 'warm', warmMatrix),
  makePreset('cool', 'Cool', 'cool', coolMatrix),
  makePreset('vivid', 'Vivid', 'dramatic', vividMatrix),
  makePreset('vintage', 'Vintage', 'vintage', vintageMatrix),
  makePreset('mono', 'Mono', 'mono', monoMatrix),
  makePreset('noir', 'Noir', 'mono', noirMatrix),
  makePreset('fade', 'Fade', 'soft', fadeMatrix),
  makePreset('dramatic', 'Dramatic', 'dramatic', dramaticMatrix),
  makePreset('soft', 'Soft', 'soft', softMatrix),
  makePreset('golden', 'Golden', 'warm', goldenMatrix),
  makePreset('forest', 'Forest', 'warm', forestMatrix),
  makePreset('crimson', 'Crimson', 'warm', crimsonMatrix),
  makePreset('azure', 'Azure', 'cool', azureMatrix),
];

// ── Adjustment parameter metadata ───────────────────────────────────────

export const ADJUST_PARAMETERS = [
  { id: 'exposure', name: 'Exposure', min: -1, max: 1, default: 0 },
  { id: 'contrast', name: 'Contrast', min: -1, max: 1, default: 0 },
  { id: 'highlights', name: 'Highlights', min: -1, max: 1, default: 0 },
  { id: 'shadows', name: 'Shadows', min: -1, max: 1, default: 0 },
  { id: 'saturation', name: 'Saturation', min: -1, max: 1, default: 0 },
  { id: 'temperature', name: 'Temperature', min: -1, max: 1, default: 0 },
  { id: 'tint', name: 'Tint', min: -1, max: 1, default: 0 },
  { id: 'fade', name: 'Fade', min: 0, max: 1, default: 0 },
  { id: 'vignette', name: 'Vignette', min: 0, max: 1, default: 0 },
  { id: 'sharpness', name: 'Sharpness', min: 0, max: 1, default: 0 },
] as const;

export type AdjustParameterId = (typeof ADJUST_PARAMETERS)[number]['id'];

/**
 * Lookup map for O(1) parameter metadata access.
 */
export const ADJUST_PARAM_MAP: Record<string, (typeof ADJUST_PARAMETERS)[number]> =
  Object.fromEntries(ADJUST_PARAMETERS.map((p) => [p.id, p]));
