/**
 * Native effect graph types for the creator effect system.
 *
 * Replaces the legacy CSS-filter approach with a real GPU-based Skia render
 * graph. The same EffectNode graph powers the effect thumbnail, editor canvas,
 * preview, viewer, and export — guaranteeing WYSIWYG across every surface
 * (spec 07 §1).
 *
 * Per AGENTS.md §11: no CSS filter strings in the production path. Every
 * effect is expressed as real render data (color matrices, LUTs, blur
 * radii, grain amounts) that Skia can execute on the GPU.
 */

// ── Effect nodes ────────────────────────────────────────────────────────

/**
 * An adjustment node — per-channel tone and color controls.
 * Each value ranges from -1 to +1 (0 = neutral), except `fade`, `vignette`,
 * and `sharpness` which range from 0 to 1.
 *
 * This node is rendered via a Skia RuntimeEffect shader (SkSL) because
 * exposure (exponential), highlights/shadows (luminance-conditional), and
 * temperature/tint (color-space shift) are non-linear and cannot be
 * expressed as a single 4×5 color matrix.
 */
export interface AdjustNode {
  type: 'adjust';
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  fade?: number;
  vignette?: number;
  sharpness?: number;
}

/**
 * A raw 4×5 color matrix node (20 numbers, row-major).
 * Skia applies: R' = R*m[0] + G*m[1] + B*m[2] + A*m[3] + m[4], etc.
 * Used by filter presets (warm, cool, vintage, mono, …).
 */
export interface MatrixNode {
  type: 'matrix';
  matrix: number[];
}

/**
 * A 3D LUT (lookup table) node — applies a color grading LUT asset.
 * `amount` is 0..1 blend strength.
 */
export interface LutNode {
  type: 'lut';
  assetId: string;
  amount: number;
}

/**
 * A Gaussian blur node.
 * `radius` is in pixels.
 */
export interface BlurNode {
  type: 'blur';
  radius: number;
}

/**
 * A film grain node — adds procedural noise.
 * `amount` is 0..1.
 */
export interface GrainNode {
  type: 'grain';
  amount: number;
}

/**
 * A mask node — applies child nodes only within the alpha region of a mask
 * asset (e.g. segmentation cutout).
 */
export interface MaskNode {
  type: 'mask';
  maskId: string;
  children: EffectNode[];
}

/**
 * The discriminated union of all effect nodes. This is the canonical effect
 * graph type used across thumbnail, canvas, viewer, and export.
 */
export type EffectNode =
  | AdjustNode
  | MatrixNode
  | LutNode
  | BlurNode
  | GrainNode
  | MaskNode;

// ── Preset & stack ──────────────────────────────────────────────────────

export type EffectPresetCategory =
  | 'original'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'mono'
  | 'dramatic'
  | 'soft';

/**
 * A filter preset built from real render data — not CSS strings.
 *
 * `nodes` is the full effect graph applied at intensity = 1.
 * `thumbnailMatrix` is an optional simplified 4×5 matrix used for fast
 * thumbnail rendering (when the full graph is too expensive for an 80×80
 * preview). If absent, the first `matrix` node in `nodes` is used.
 *
 * `intensity` is the default blend strength (0..1, default 1) — the renderer
 * interpolates between the identity (no effect) and the full graph.
 *
 * `version` is bumped whenever the preset's render data changes, so thumbnail
 * caches can be invalidated.
 */
export interface EffectPreset {
  id: string;
  name: string;
  category: EffectPresetCategory;
  nodes: EffectNode[];
  intensity: number;
  thumbnailMatrix?: number[];
  version: number;
}

/**
 * The effective effect stack applied to a media layer — preset selection +
 * intensity + manual adjustments, all expressed as a flat node list for the
 * renderer.
 */
export interface EffectStack {
  presetId: string | null;
  intensity: number;
  adjustments: Partial<AdjustNode>;
  nodes: EffectNode[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * The identity 4×5 color matrix (no-op).
 */
export const IDENTITY_MATRIX: readonly number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Extract the usable thumbnail matrix from a preset: prefers the explicit
 * `thumbnailMatrix`, falls back to the first `matrix` node, then to identity.
 */
export function getThumbnailMatrix(preset: EffectPreset): number[] {
  if (preset.thumbnailMatrix) return preset.thumbnailMatrix;
  const matrixNode = preset.nodes.find(
    (n): n is MatrixNode => n.type === 'matrix',
  );
  if (matrixNode) return matrixNode.matrix;
  return [...IDENTITY_MATRIX];
}

/**
 * Interpolate between the identity matrix and a target matrix by `t` (0..1).
 * Used for intensity blending — at t=0 the image is untouched, at t=1 the
 * full effect is applied.
 */
export function interpolateMatrix(
  target: readonly number[],
  t: number,
): number[] {
  const clamped = Math.min(1, Math.max(0, t));
  const result: number[] = new Array(20);
  for (let i = 0; i < 20; i++) {
    result[i] = IDENTITY_MATRIX[i] + (target[i] - IDENTITY_MATRIX[i]) * clamped;
  }
  return result;
}
