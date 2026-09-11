/**
 * Canonical JS-side filter color matrices for the 10 flagship filters.
 *
 * This is the JS renderer's source of truth for filter ColorMatrix values.
 * It MUST stay byte-identical to:
 *   - `backend/api/src/lib/media/compositionRenderer.ts`   (server SVG renderer)
 *   - `frontend/src/components/poster/filters/filterConfig.ts` (Skia preview)
 *
 * The cross-renderer agreement test
 * (`frontend/src/creator/__tests__/filterMatrixAgreement.test.ts`) parses
 * all three sources and fails loudly if any matrix or the interpolation
 * function drifts. Do not edit one copy without updating the others.
 */

/** 4×5 row-major identity color matrix (no-op). */
export const IDENTITY_MATRIX: number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * The 10 flagship filter preset matrices at full intensity.
 * Keys are the canonical filter IDs shared across all renderers.
 */
export const FILTER_PRESET_MATRICES: Record<string, number[]> = {
  normal: IDENTITY_MATRIX,
  warm: [
    1.12, 0, 0, 0, 0.02,
    0, 1.02, 0, 0, 0,
    0, 0, 0.88, 0, -0.02,
    0, 0, 0, 1, 0,
  ],
  cool: [
    0.88, 0, 0, 0, -0.02,
    0, 1.02, 0, 0, 0,
    0, 0, 1.12, 0, 0.02,
    0, 0, 0, 1, 0,
  ],
  vintage: [
    0.575, 0.538, 0.132, 0, 0,
    0.544, 0.480, 0.118, 0, 0,
    0.390, 0.374, 0.092, 0, 0,
    0, 0, 0, 1, 0,
  ],
  bw: [
    0.329, 0.646, 0.125, 0, -0.05,
    0.329, 0.646, 0.125, 0, -0.05,
    0.329, 0.646, 0.125, 0, -0.05,
    0, 0, 0, 1, 0,
  ],
  cinematic: [
    1.15, 0, 0, 0, -0.075,
    0, 1.15, 0, 0, -0.075,
    0, 0, 1.20, 0, -0.10,
    0, 0, 0, 1, 0,
  ],
  fade: [
    0.82, 0.08, 0.08, 0, 0.06,
    0.08, 0.82, 0.08, 0, 0.06,
    0.08, 0.08, 0.82, 0, 0.06,
    0, 0, 0, 1, 0,
  ],
  vivid: [
    1.331, -0.194, -0.038, 0, -0.05,
    -0.099, 1.236, -0.038, 0, -0.05,
    -0.099, -0.194, 1.392, 0, -0.05,
    0, 0, 0, 1, 0,
  ],
  noir: [
    0.389, 0.763, 0.148, 0, -0.15,
    0.389, 0.763, 0.148, 0, -0.15,
    0.389, 0.763, 0.148, 0, -0.15,
    0, 0, 0, 1, 0,
  ],
  golden: [
    1.15, 0.05, 0, 0, 0.03,
    0.05, 1.05, 0.02, 0, 0.01,
    0, 0.02, 0.82, 0, -0.02,
    0, 0, 0, 1, 0,
  ],
};

/**
 * Interpolate between the identity matrix and a filter's target matrix
 * by intensity (0..1). At intensity 0 the result is identity (original),
 * at intensity 1 the result is the full filter effect.
 *
 * Formula: matrix[i] = identity[i] + (target[i] - identity[i]) * intensity
 *
 * Mirrors `interpolateMatrix` in `compositionRenderer.ts` and
 * `interpolateColorMatrix` in `filterConfig.ts` exactly.
 */
export function interpolateMatrix(target: number[], intensity: number): number[] {
  const t = Math.max(0, Math.min(1, intensity));
  return IDENTITY_MATRIX.map((id, i) => id + (target[i] - id) * t);
}

/** Returns true when the matrix is effectively the identity (no-op). */
export function isIdentityMatrix(m: number[]): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY_MATRIX[i]) < 1e-6);
}

/**
 * Multiply two 4×5 color matrices (row-major). Used to combine multiple
 * filter preset effects into a single matrix. Mirrors `multiplyMatrix`
 * in `compositionRenderer.ts`.
 */
export function multiplyMatrix(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 5 + k] * b[k * 5 + col];
      }
      if (col === 4) sum += a[row * 5 + 4];
      result[row * 5 + col] = sum;
    }
  }
  return result;
}
