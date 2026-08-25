/**
 * LookAutoLayout — automatic layout engine for Look collages.
 *
 * Given a set of `CreatorLayer`s and a canvas size, arranges the media
 * layers automatically according to a chosen layout style. Coordinates
 * are normalized 0–1 (matching the `CreatorLayer` model in composition.ts),
 * so the same layout works at any canvas resolution.
 *
 * Only media layers (type 'media') are repositioned. Every other layer
 * (text, product, decorative, draw, stickers, adjustment, etc.) is left
 * untouched — auto-layout never silently moves user-authored overlays.
 *
 * Layout styles:
 *   - 'grid'     — even grid, 2 columns, 8pt spacing
 *   - 'masonry'  — Pinterest-style columns with varying heights based on
 *                  each layer's aspect ratio
 *   - 'feature'  — first layer occupies 60% of the canvas; remaining
 *                  layers share the 40% column
 *   - 'strip'    — horizontal strip, equal widths
 *   - 'collage'  — slight rotations (−5°..+5°) and overlaps
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §11: real transforms, no stubs.
 */
import type { CreatorLayer } from '../composition';

// ── Types ──────────────────────────────────────────────────────────────

export type LayoutStyle = 'grid' | 'masonry' | 'feature' | 'strip' | 'collage';

/**
 * Legacy alias for `LayoutStyle`, retained so existing callers that import
 * `AutoLayoutId` continue to compile. The canonical name is `LayoutStyle`.
 */
export type AutoLayoutId = LayoutStyle;

export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * The ordered set of layout styles exposed by the auto-layout bar.
 * The order is deliberate: grid → masonry → feature → strip → collage,
 * moving from the most structured to the most expressive.
 */
export const LAYOUT_STYLES: readonly LayoutStyle[] = [
  'grid',
  'masonry',
  'feature',
  'strip',
  'collage',
];

// ── Constants ──────────────────────────────────────────────────────────

/** Spacing in physical points. Converted to normalized space per canvas. */
const SPACING_PT = 8;

/** Padding inset in physical points so layouts breathe at the edges. */
const PADDING_PT = 8;

/** Collage rotation range in degrees (±). */
const COLLAGE_ROTATION_DEG = 5;

/** Collage overlap as a fraction of cell size. */
const COLLAGE_OVERLAP = 0.12;

/** Feature layout: hero occupies this fraction of the canvas width. */
const FEATURE_HERO_WIDTH = 0.6;

// ── Helpers ────────────────────────────────────────────────────────────

/** A media layer with its resolved aspect ratio (width / height). */
interface MediaPlacement {
  layer: Extract<CreatorLayer, { type: 'media' }>;
  index: number;
  aspect: number;
}

/**
 * Resolve a media layer's aspect ratio from its payload dimensions, falling
 * back to a 4:5 portrait (the dominant creator camera crop) when the layer
 * geometry is square or unknown so masonry produces varied, realistic
 * heights.
 */
function resolveAspect(
  layer: Extract<CreatorLayer, { type: 'media' }>,
): number {
  const w = layer.width;
  const h = layer.height;
  if (h > 0 && w > 0) {
    const ratio = w / h;
    if (Number.isFinite(ratio) && ratio > 0) return ratio;
  }
  return 0.8; // 4:5 portrait fallback
}

/** Clamp a normalized value into the valid layer range [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Clamp into the composition schema's allowed range. */
function clampLayer(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Layout: grid ───────────────────────────────────────────────────────
// Even grid with 2 columns and 8pt spacing. Rows are added as needed.
// Each cell shares the same width and height, producing a clean grid.

function layoutGrid(
  media: MediaPlacement[],
  canvas: CanvasSize,
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  const count = media.length;
  if (count === 0) return [];

  const cols = 2;
  const rows = Math.ceil(count / cols);

  const spacingX = SPACING_PT / canvas.width;
  const spacingY = SPACING_PT / canvas.height;
  const padX = PADDING_PT / canvas.width;
  const padY = PADDING_PT / canvas.height;

  const cellW = (1 - padX * 2 - spacingX * (cols - 1)) / cols;
  const cellH = (1 - padY * 2 - spacingY * (rows - 1)) / rows;

  const result: Array<{ x: number; y: number; width: number; height: number; rotation: number }> = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    result.push({
      x: clamp01(padX + col * (cellW + spacingX)),
      y: clamp01(padY + row * (cellH + spacingY)),
      width: clamp01(cellW),
      height: clamp01(cellH),
      rotation: 0,
    });
  }
  return result;
}

// ── Layout: masonry ────────────────────────────────────────────────────
// Pinterest-style columns. Each layer is placed into the shortest column.
// The cell height varies based on the layer's aspect ratio so portrait
// images get taller cells and landscape images get shorter cells.

function layoutMasonry(
  media: MediaPlacement[],
  canvas: CanvasSize,
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  const count = media.length;
  if (count === 0) return [];

  const cols = count <= 4 ? 2 : 3;

  const spacingX = SPACING_PT / canvas.width;
  const spacingY = SPACING_PT / canvas.height;
  const padX = PADDING_PT / canvas.width;
  const padY = PADDING_PT / canvas.height;

  const colW = (1 - padX * 2 - spacingX * (cols - 1)) / cols;

  const colBottoms = new Array<number>(cols).fill(padY);

  const result: Array<{ x: number; y: number; width: number; height: number; rotation: number }> = [];
  for (let i = 0; i < count; i++) {
    let shortestCol = 0;
    for (let c = 1; c < cols; c++) {
      if (colBottoms[c] < colBottoms[shortestCol]) shortestCol = c;
    }

    const x = padX + shortestCol * (colW + spacingX);
    const y = colBottoms[shortestCol];

    const aspect = media[i].aspect;
    let cellH = colW / aspect;
    cellH = Math.max(0.18, Math.min(0.5, cellH));

    result.push({
      x: clamp01(x),
      y: clamp01(y),
      width: clamp01(colW),
      height: clamp01(cellH),
      rotation: 0,
    });

    colBottoms[shortestCol] = y + cellH + spacingY;
  }
  return result;
}

// ── Layout: feature ────────────────────────────────────────────────────
// The first media layer becomes the hero at 60% of the canvas width and
// full height. Remaining layers share the 40% column on the right.

function layoutFeature(
  media: MediaPlacement[],
  canvas: CanvasSize,
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  const count = media.length;
  if (count === 0) return [];

  const spacing = SPACING_PT / Math.min(canvas.width, canvas.height);
  const pad = PADDING_PT / Math.min(canvas.width, canvas.height);

  const heroW = FEATURE_HERO_WIDTH - pad;
  const heroH = 1 - pad * 2;
  const heroX = pad;
  const heroY = pad;

  const result: Array<{ x: number; y: number; width: number; height: number; rotation: number }> = [
    {
      x: clamp01(heroX),
      y: clamp01(heroY),
      width: clamp01(heroW),
      height: clamp01(heroH),
      rotation: 0,
    },
  ];

  const remaining = count - 1;
  if (remaining > 0) {
    const colX = heroX + heroW + spacing;
    const colW = 1 - colX - pad;
    const slotH = (heroH - spacing * (remaining - 1)) / remaining;
    for (let i = 0; i < remaining; i++) {
      result.push({
        x: clamp01(colX),
        y: clamp01(heroY + i * (slotH + spacing)),
        width: clamp01(colW),
        height: clamp01(slotH),
        rotation: 0,
      });
    }
  }
  return result;
}

// ── Layout: strip ──────────────────────────────────────────────────────
// Horizontal strip: every layer gets an equal width, full height.

function layoutStrip(
  media: MediaPlacement[],
  canvas: CanvasSize,
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  const count = media.length;
  if (count === 0) return [];

  const spacing = SPACING_PT / canvas.width;
  const padX = PADDING_PT / canvas.width;
  const padY = PADDING_PT / canvas.height;

  const cellW = (1 - padX * 2 - spacing * (count - 1)) / count;
  const cellH = 1 - padY * 2;

  const result: Array<{ x: number; y: number; width: number; height: number; rotation: number }> = [];
  for (let i = 0; i < count; i++) {
    result.push({
      x: clamp01(padX + i * (cellW + spacing)),
      y: clamp01(padY),
      width: clamp01(cellW),
      height: clamp01(cellH),
      rotation: 0,
    });
  }
  return result;
}

// ── Layout: collage ────────────────────────────────────────────────────
// Slight rotations (−5°..+5°) and overlaps. Deterministic by index so the
// collage is stable across re-renders. Later layers overlap earlier ones.

function layoutCollage(
  media: MediaPlacement[],
  _canvas: CanvasSize,
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  const count = media.length;
  if (count === 0) return [];

  const cellSize = 0.42;
  const result: Array<{ x: number; y: number; width: number; height: number; rotation: number }> = [];

  for (let i = 0; i < count; i++) {
    const seed = i * 2.357 + 0.5;
    const offsetX = Math.sin(seed) * (0.18 - COLLAGE_OVERLAP);
    const offsetY = Math.cos(seed * 1.3) * (0.18 - COLLAGE_OVERLAP);
    const cx = 0.5 + offsetX;
    const cy = 0.5 + offsetY;
    const rotation = Math.sin(seed * 0.7) * COLLAGE_ROTATION_DEG;

    result.push({
      x: clamp01(cx - cellSize / 2),
      y: clamp01(cy - cellSize / 2),
      width: clamp01(cellSize),
      height: clamp01(cellSize),
      rotation,
    });
  }
  return result;
}

// ── Dispatcher ─────────────────────────────────────────────────────────

function computePlacements(
  style: LayoutStyle,
  media: MediaPlacement[],
  canvas: CanvasSize,
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  switch (style) {
    case 'grid':
      return layoutGrid(media, canvas);
    case 'masonry':
      return layoutMasonry(media, canvas);
    case 'feature':
      return layoutFeature(media, canvas);
    case 'strip':
      return layoutStrip(media, canvas);
    case 'collage':
      return layoutCollage(media, canvas);
    default:
      return layoutGrid(media, canvas);
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Automatically arrange the media layers in `layers` according to `style`.
 *
 * Returns a new layer array with updated `x`, `y`, `width`, `height`, and
 * `rotation` on every media layer. Non-media layers are returned untouched
 * (same reference). Media layers that cannot be placed keep their geometry.
 *
 * Per §8.3: auto-layout NEVER silently moves a manually positioned object
 * after the creator has edited. Layers with `manuallyPositioned: true` are
 * skipped — only auto-layout-eligible media layers are rearranged. The
 * layout is computed across the eligible subset and their placements are
 * slotted into the available canvas regions.
 *
 * The layout is computed in normalized 0–1 space; `canvasSize` is used to
 * convert physical spacing (8pt) into normalized fractions and to compute
 * aspect-ratio-aware heights for the masonry style.
 *
 * zIndex is reassigned for eligible media layers in source order so later
 * layers render above earlier ones (important for the collage style).
 * Manually-positioned layers keep their existing zIndex.
 */
export function autoLayout(
  layers: CreatorLayer[],
  canvasSize: CanvasSize,
  style: LayoutStyle,
): CreatorLayer[] {
  if (layers.length === 0) return layers;

  const media: MediaPlacement[] = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.type === 'media' && !layer.manuallyPositioned) {
      // Skip manually-positioned layers (§8.3: never silently move
      // a manually positioned object after the creator has edited).
      // manuallyPositioned is optional — undefined is treated as false.
      media.push({ layer, index: i, aspect: resolveAspect(layer) });
    }
  }

  if (media.length === 0) return layers;

  const placements = computePlacements(style, media, canvasSize);

  const result = layers.slice();
  for (let i = 0; i < media.length; i++) {
    const { index } = media[i];
    const placement = placements[i];
    if (!placement) continue;
    const original = result[index];
    if (original.type !== 'media') continue;
    result[index] = {
      ...original,
      x: clampLayer(placement.x, -0.5, 1.5),
      y: clampLayer(placement.y, -0.5, 1.5),
      width: clampLayer(placement.width, 0.05, 2),
      height: clampLayer(placement.height, 0.05, 2),
      rotation: clampLayer(placement.rotation, -360, 360),
      zIndex: i + 1,
    };
  }

  return result;
}
