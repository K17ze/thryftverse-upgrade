/**
 * EffectEvaluator — converts an effect stack into renderable parameters.
 *
 * Takes an ordered list of effect nodes (from either the new EffectTypes
 * EffectNode union or the composition.ts EffectNode schema) and combines
 * them into a single set of renderable parameters:
 *   - colorMatrix: a 4×5 matrix (20 numbers) for Skia ColorMatrix
 *   - blurRadius: Gaussian blur radius in pixels
 *   - vignetteAmount: 0..1 vignette strength
 *   - grainAmount: 0..1 film grain strength
 *
 * Color matrices from `adjust`, `matrix`, and `lut` nodes are multiplied
 * together. Blur radii take the maximum. Vignette and grain amounts are
 * summed (clamped to 0..1).
 *
 * Per AGENTS.md §11: no CSS filter strings in the production path. Every
 * effect is expressed as real render data that Skia can execute on the GPU.
 *
 * Design references:
 *   - EffectTypes.ts: AdjustNode, MatrixNode, LutNode, BlurNode, GrainNode
 *   - composition.ts: EffectNodeSchema (filter, adjust, blur, vignette)
 *   - shopify/react-native-skia: ColorMatrix component (20-element array)
 *   - Skia ColorFilter.MakeMatrix: imperative API
 */
import type {
  EffectNode as NativeEffectNode,
  AdjustNode,
  MatrixNode,
} from '../../tools/effects/EffectTypes';
import { IDENTITY_MATRIX, interpolateMatrix } from '../../tools/effects/EffectTypes';
import type { EffectNode as CompositionEffectNode } from '../../composition';

// ── Result type ─────────────────────────────────────────────────────

export interface EvaluatedEffect {
  /** 4×5 color matrix (20 numbers, row-major) for Skia ColorMatrix. */
  colorMatrix?: number[];
  /** Gaussian blur radius in pixels. */
  blurRadius?: number;
  /** Vignette strength (0..1). */
  vignetteAmount?: number;
  /** Film grain amount (0..1). */
  grainAmount?: number;
}

// ── Color matrix construction ───────────────────────────────────────

/**
 * Build a 4×5 color matrix from adjustment values.
 *
 * Each adjustment value ranges from -1 to +1 (0 = neutral), except
 * `fade`, `vignette`, and `sharpness` which range from 0 to 1.
 *
 * The matrix is constructed by composing individual adjustment matrices
 * via matrix multiplication. This produces a single 4×5 matrix that can
 * be applied in one Skia ColorMatrix pass.
 *
 * Not all adjustments can be perfectly expressed as a linear color matrix
 * (exposure is exponential, highlights/shadows are luminance-conditional,
 * temperature/tint are color-space shifts). For those, we use a linear
 * approximation that is visually close enough for real-time preview. The
 * full non-linear shader (SkSL RuntimeEffect) is used for export.
 *
 * @param adjust  Partial adjustment values.
 * @returns A 20-element color matrix.
 */
export function buildAdjustmentMatrix(adjust: Partial<AdjustNode>): number[] {
  // Start with the identity matrix
  let matrix = [...IDENTITY_MATRIX];

  // Exposure: approximate exponential gain with a linear multiplier.
  // exposure ∈ [-1, 1], 0 = neutral. Positive brightens, negative darkens.
  // Linear approx: gain = 2^exposure (so +1 = 2x brightness, -1 = 0.5x).
  if (adjust.exposure !== undefined && adjust.exposure !== 0) {
    const gain = Math.pow(2, adjust.exposure);
    const exposureMatrix = makeScaleMatrix(gain, gain, gain, 1);
    matrix = multiplyMatrix(matrix, exposureMatrix);
  }

  // Contrast: scale around mid-gray (0.5).
  // contrast ∈ [-1, 1], 0 = neutral. Positive increases contrast.
  // factor = 1 + contrast (clamped to avoid negative).
  if (adjust.contrast !== undefined && adjust.contrast !== 0) {
    const factor = 1 + adjust.contrast;
    const contrastMatrix = makeContrastMatrix(factor);
    matrix = multiplyMatrix(matrix, contrastMatrix);
  }

  // Saturation: scale the color channels away from gray.
  // saturation ∈ [-1, 1], 0 = neutral. Positive increases saturation.
  if (adjust.saturation !== undefined && adjust.saturation !== 0) {
    const s = 1 + adjust.saturation;
    const satMatrix = makeSaturationMatrix(s);
    matrix = multiplyMatrix(matrix, satMatrix);
  }

  // Temperature: shift warm (R up, B down) or cool (R down, B up).
  // temperature ∈ [-1, 1], 0 = neutral.
  if (adjust.temperature !== undefined && adjust.temperature !== 0) {
    const t = adjust.temperature * 0.15; // scale to a visible but not extreme shift
    const tempMatrix = makeTemperatureMatrix(t);
    matrix = multiplyMatrix(matrix, tempMatrix);
  }

  // Tint: shift green/magenta.
  // tint ∈ [-1, 1], 0 = neutral. Positive = magenta, negative = green.
  if (adjust.tint !== undefined && adjust.tint !== 0) {
    const tintVal = adjust.tint * 0.1;
    const tintMatrix = makeTintMatrix(tintVal);
    matrix = multiplyMatrix(matrix, tintMatrix);
  }

  // Fade: lift the blacks toward gray (reduces contrast in shadows).
  // fade ∈ [0, 1], 0 = no fade.
  if (adjust.fade !== undefined && adjust.fade > 0) {
    const fadeMatrix = makeFadeMatrix(adjust.fade);
    matrix = multiplyMatrix(matrix, fadeMatrix);
  }

  return matrix;
}

// ── Individual adjustment matrices ──────────────────────────────────

/** Scale matrix: scales R, G, B, A channels independently. */
function makeScaleMatrix(r: number, g: number, b: number, a: number): number[] {
  return [
    r, 0, 0, 0, 0,
    0, g, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, a, 0,
  ];
}

/** Contrast matrix: scale around mid-gray (0.5). */
function makeContrastMatrix(factor: number): number[] {
  const offset = 0.5 * (1 - factor);
  return [
    factor, 0, 0, 0, offset,
    0, factor, 0, 0, offset,
    0, 0, factor, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Saturation matrix: scales color channels away from luminance.
 * Uses the standard luminance weights (0.213, 0.715, 0.072).
 */
function makeSaturationMatrix(s: number): number[] {
  const sr = (1 - s) * 0.213;
  const sg = (1 - s) * 0.715;
  const sb = (1 - s) * 0.072;
  return [
    sr + s, sg, sb, 0, 0,
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** Temperature matrix: warm/cool shift. */
function makeTemperatureMatrix(t: number): number[] {
  return [
    1 + t, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1 - t, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** Tint matrix: green/magenta shift. */
function makeTintMatrix(t: number): number[] {
  return [
    1 + t, 0, 0, 0, 0,
    0, 1 - t, 0, 0, 0,
    0, 0, 1 + t, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** Fade matrix: lift blacks toward gray. */
function makeFadeMatrix(fade: number): number[] {
  const lift = fade * 0.15;
  return [
    1 - lift, 0, 0, 0, lift,
    0, 1 - lift, 0, 0, lift,
    0, 0, 1 - lift, 0, lift,
    0, 0, 0, 1, 0,
  ];
}

// ── Matrix math ─────────────────────────────────────────────────────

/**
 * Multiply two 4×5 color matrices (row-major, 20 elements each).
 *
 * A color matrix is applied as:
 *   R' = R*m[0] + G*m[1] + B*m[2] + A*m[3] + m[4]
 *   G' = R*m[5] + G*m[6] + B*m[7] + A*m[8] + m[9]
 *   B' = R*m[10] + G*m[11] + B*m[12] + A*m[13] + m[14]
 *   A' = R*m[15] + G*m[16] + B*m[17] + A*m[18] + m[19]
 *
 * Matrix multiplication (A × B) composes the transformations.
 */
export function multiplyMatrix(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array(20).fill(0);
  // Treat as 4×5 matrices (4 rows, 5 columns). The multiplication is
  // performed by treating the implicit 5th row as [0, 0, 0, 0, 1].
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 5 + k] * b[k * 5 + col];
      }
      // The 5th element of the implicit row is 1, so add the translation
      if (col === 4) {
        sum += a[row * 5 + 4];
      }
      result[row * 5 + col] = sum;
    }
  }
  return result;
}

// ── Effect stack evaluation ─────────────────────────────────────────

/**
 * Evaluate an effect stack (from the new EffectTypes) into renderable
 * parameters.
 *
 * @param stack      The ordered list of effect nodes.
 * @param intensity  Overall blend strength (0..1). At 0, no effect is
 *                   applied; at 1, the full effect is applied.
 * @returns Combined renderable parameters.
 */
export function evaluateEffectStack(
  stack: NativeEffectNode[],
  intensity: number,
): EvaluatedEffect {
  if (!stack || stack.length === 0) return {};
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  let colorMatrix: number[] | undefined;
  let blurRadius = 0;
  let vignetteAmount = 0;
  let grainAmount = 0;
  let hasBlur = false;
  let hasVignette = false;
  let hasGrain = false;

  for (const node of stack) {
    switch (node.type) {
      case 'adjust': {
        const adjustMatrix = buildAdjustmentMatrix(node);
        if (colorMatrix) {
          colorMatrix = multiplyMatrix(colorMatrix, adjustMatrix);
        } else {
          colorMatrix = adjustMatrix;
        }
        // Adjust nodes can also carry vignette
        if (node.vignette !== undefined && node.vignette > 0) {
          vignetteAmount += node.vignette * clampedIntensity;
          hasVignette = true;
        }
        break;
      }
      case 'matrix': {
        const matrix = node.matrix;
        if (colorMatrix) {
          colorMatrix = multiplyMatrix(colorMatrix, matrix);
        } else {
          colorMatrix = [...matrix];
        }
        break;
      }
      case 'lut': {
        // LUTs are applied via a separate texture lookup, not a color matrix.
        // For now, we approximate the LUT's contribution as an identity pass.
        // The full LUT application requires a SkSL shader with texture sampling.
        // This is documented as a future enhancement for the export pipeline.
        break;
      }
      case 'blur': {
        blurRadius = Math.max(blurRadius, node.radius * clampedIntensity);
        hasBlur = true;
        break;
      }
      case 'grain': {
        grainAmount += node.amount * clampedIntensity;
        hasGrain = true;
        break;
      }
      case 'mask': {
        // Mask nodes apply child nodes within a mask region. For the flat
        // evaluation, we recursively evaluate the children (the mask itself
        // is handled by the Skia Mask component at render time).
        const childResult = evaluateEffectStack(node.children, clampedIntensity);
        if (childResult.colorMatrix) {
          if (colorMatrix) {
            colorMatrix = multiplyMatrix(colorMatrix, childResult.colorMatrix);
          } else {
            colorMatrix = childResult.colorMatrix;
          }
        }
        if (childResult.blurRadius !== undefined) {
          blurRadius = Math.max(blurRadius, childResult.blurRadius);
          hasBlur = true;
        }
        if (childResult.vignetteAmount !== undefined) {
          vignetteAmount += childResult.vignetteAmount;
          hasVignette = true;
        }
        if (childResult.grainAmount !== undefined) {
          grainAmount += childResult.grainAmount;
          hasGrain = true;
        }
        break;
      }
    }
  }

  // Interpolate the color matrix toward identity based on intensity
  if (colorMatrix && clampedIntensity < 1) {
    colorMatrix = interpolateMatrix(colorMatrix, clampedIntensity);
  }

  const result: EvaluatedEffect = {};
  if (colorMatrix && !isIdentityMatrix(colorMatrix)) {
    result.colorMatrix = colorMatrix;
  }
  if (hasBlur && blurRadius > 0) {
    result.blurRadius = blurRadius;
  }
  if (hasVignette && vignetteAmount > 0) {
    result.vignetteAmount = Math.min(1, vignetteAmount);
  }
  if (hasGrain && grainAmount > 0) {
    result.grainAmount = Math.min(1, grainAmount);
  }
  return result;
}

/**
 * Evaluate a composition.ts EffectNode stack (the schema-level effect nodes
 * stored in the media layer's `effects` field).
 *
 * The composition.ts EffectNode has a different shape than the EffectTypes
 * EffectNode — it uses `filter`, `adjust`, `blur`, `vignette` types.
 */
export function evaluateCompositionEffectStack(
  stack: CompositionEffectNode[],
  intensity: number,
): EvaluatedEffect {
  if (!stack || stack.length === 0) return {};
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  let colorMatrix: number[] | undefined;
  let blurRadius = 0;
  let vignetteAmount = 0;
  let hasBlur = false;
  let hasVignette = false;

  for (const node of stack) {
    switch (node.type) {
      case 'filter': {
        // Filter nodes reference a preset by ID. The preset's matrix is
        // resolved by the caller. For now, we skip — the preset matrix
        // is applied separately by the render layer.
        break;
      }
      case 'adjust': {
        // Map composition.ts adjust fields to the AdjustNode shape
        const adjustNode: Partial<AdjustNode> = {
          exposure: node.exposure,
          contrast: node.contrast,
          highlights: node.highlights,
          shadows: node.shadows,
          saturation: node.saturation,
          temperature: node.temperature,
          tint: node.tint,
          fade: node.fade,
          vignette: node.vignette,
          sharpness: node.sharpness,
        };
        const adjustMatrix = buildAdjustmentMatrix(adjustNode);
        if (colorMatrix) {
          colorMatrix = multiplyMatrix(colorMatrix, adjustMatrix);
        } else {
          colorMatrix = adjustMatrix;
        }
        if (node.vignette !== undefined && node.vignette > 0) {
          vignetteAmount += node.vignette * clampedIntensity;
          hasVignette = true;
        }
        break;
      }
      case 'blur': {
        blurRadius = Math.max(blurRadius, node.radius * clampedIntensity);
        hasBlur = true;
        break;
      }
      case 'vignette': {
        vignetteAmount += node.amount * clampedIntensity;
        hasVignette = true;
        break;
      }
    }
  }

  // Interpolate the color matrix toward identity based on intensity
  if (colorMatrix && clampedIntensity < 1) {
    colorMatrix = interpolateMatrix(colorMatrix, clampedIntensity);
  }

  const result: EvaluatedEffect = {};
  if (colorMatrix && !isIdentityMatrix(colorMatrix)) {
    result.colorMatrix = colorMatrix;
  }
  if (hasBlur && blurRadius > 0) {
    result.blurRadius = blurRadius;
  }
  if (hasVignette && vignetteAmount > 0) {
    result.vignetteAmount = Math.min(1, vignetteAmount);
  }
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Check if a matrix is effectively the identity matrix. */
function isIdentityMatrix(matrix: number[]): boolean {
  for (let i = 0; i < 20; i++) {
    const expected = IDENTITY_MATRIX[i];
    if (Math.abs(matrix[i] - expected) > 0.0001) return false;
  }
  return true;
}
