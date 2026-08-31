/**
 * Layout preview type system for the Look composer.
 *
 * Layouts are described as a set of normalized transforms (0–1 relative to
 * the canvas) so the same definition can drive both the mini preview
 * thumbnails and the full-size canvas commit.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 */

export type LayoutId =
  | 'editorial'
  | 'grid'
  | 'hero'
  | 'pair'
  | 'scatter'
  | 'stack'
  | 'magazine'
  | 'minimal'
  | 'split-screen'
  | 'polaroid'
  | 'vertical-strip'
  | 'mosaic';

/**
 * A single asset placement in normalized canvas space.
 *
 * x / y / width / height are 0–1 relative to the canvas. x/y denote the
 * top-left corner of the asset rectangle (matching the preview renderer's
 * absolute layout model). rotation is in degrees. zIndex controls overlap.
 */
export interface AssetTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  overflowCount?: number;
}

export interface LayoutDefinition {
  id: LayoutId;
  name: string;
  minAssets: number;
  maxAssets: number;
  /** Compute transforms for N assets in this layout. */
  computeTransforms: (
    assetCount: number,
    canvasWidth: number,
    canvasHeight: number,
  ) => AssetTransform[];
}

export interface LayoutPreview {
  id: LayoutId;
  name: string;
  transforms: AssetTransform[];
  /**
   * Layout quality score (0–1, higher is better). Computed by
   * `scoreLayout` based on aspect fit, overlap, negative space, and
   * product-label safety. Used to rank alternative layouts so the
   * best-fitting composition is presented first (§8.3).
   */
  score?: number;
}
