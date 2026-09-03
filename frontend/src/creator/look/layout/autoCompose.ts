/**
 * Auto-composition engine for the Look composer.
 *
 * Given N asset URIs and a canvas size, picks the best default layout and
 * generates a set of alternative layouts that work with the asset count.
 * Replaces the blind "Try arrangement" cycling with deterministic,
 * previewable layout options.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 */
import type {
  AssetTransform,
  LayoutDefinition,
  LayoutId,
  LayoutPreview,
} from './layoutTypes';

// ── Layout algorithms ───────────────────────────────────────────────
// All transforms use normalized 0–1 coordinates where x/y is the top-left
// corner of the asset rectangle. The preview renderer multiplies by the
// thumbnail width/height; the canvas commit multiplies by the real canvas.

/** Gap between cells, as a fraction of canvas width. */
const GAP = 0.04;

/** hero: 1 large image centered, 80% of canvas. */
const heroLayout: LayoutDefinition = {
  id: 'hero',
  name: 'Hero',
  minAssets: 1,
  maxAssets: 1,
  computeTransforms: (_assetCount, _canvasWidth, _canvasHeight) => {
    const size = 0.8;
    return [
      {
        x: (1 - size) / 2,
        y: (1 - size) / 2,
        width: size,
        height: size,
        rotation: 0,
        zIndex: 1,
      },
    ];
  },
};

/** pair: 2 images side by side, 48% width each, with a gap. */
const pairLayout: LayoutDefinition = {
  id: 'pair',
  name: 'Pair',
  minAssets: 2,
  maxAssets: 2,
  computeTransforms: (assetCount) => {
    const w = 0.48;
    const h = 0.9;
    const yTop = (1 - h) / 2;
    const transforms: AssetTransform[] = [];
    for (let i = 0; i < Math.min(assetCount, 2); i++) {
      transforms.push({
        x: i === 0 ? GAP : 1 - w - GAP,
        y: yTop,
        width: w,
        height: h,
        rotation: 0,
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

/** grid: 2x2 for 4, 2x3 for 6, equal cells. Adapts rows/cols to count. */
const gridLayout: LayoutDefinition = {
  id: 'grid',
  name: 'Grid',
  minAssets: 3,
  maxAssets: 9,
  computeTransforms: (assetCount) => {
    const { rows, cols } = pickGridDimensions(assetCount);
    const cellW = (1 - GAP * (cols + 1)) / cols;
    const cellH = (1 - GAP * (rows + 1)) / rows;
    const transforms: AssetTransform[] = [];
    for (let i = 0; i < assetCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      transforms.push({
        x: GAP + col * (cellW + GAP),
        y: GAP + row * (cellH + GAP),
        width: cellW,
        height: cellH,
        rotation: 0,
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

function pickGridDimensions(count: number): { rows: number; cols: number } {
  if (count <= 4) return { rows: 2, cols: 2 };
  if (count <= 6) return { rows: 2, cols: 3 };
  if (count <= 9) return { rows: 3, cols: 3 };
  return { rows: 3, cols: 4 };
}

/**
 * editorial: 1 large (60%) + 2 small (40%) stacked on the right.
 * Adapts to fewer assets — drops the small slots if unavailable.
 */
const editorialLayout: LayoutDefinition = {
  id: 'editorial',
  name: 'Editorial',
  minAssets: 1,
  maxAssets: 6,
  computeTransforms: (assetCount) => {
    const transforms: AssetTransform[] = [];
    if (assetCount === 0) return transforms;

    // Hero occupies the left ~60%.
    const heroW = 0.6;
    const heroH = 0.92;
    transforms.push({
      x: GAP,
      y: (1 - heroH) / 2,
      width: heroW,
      height: heroH,
      rotation: 0,
      zIndex: 1,
    });

    // Remaining assets stack in the right column.
    const remaining = assetCount - 1;
    if (remaining > 0) {
      const colX = heroW + GAP * 2;
      const colW = 1 - colX - GAP;
      const slotH = (heroH - GAP * (remaining - 1)) / remaining;
      for (let i = 0; i < remaining; i++) {
        transforms.push({
          x: colX,
          y: (1 - heroH) / 2 + i * (slotH + GAP),
          width: colW,
          height: slotH,
          rotation: 0,
          zIndex: i + 2,
        });
      }
    }
    return transforms;
  },
};

/**
 * scatter: overlapping images at varied deterministic rotations.
 * Deterministic by index so the layout is stable across re-renders.
 */
const scatterLayout: LayoutDefinition = {
  id: 'scatter',
  name: 'Scatter',
  minAssets: 2,
  maxAssets: 8,
  computeTransforms: (assetCount) => {
    const cellSize = 0.42;
    const transforms: AssetTransform[] = [];
    for (let i = 0; i < assetCount; i++) {
      const seed = i * 2.357 + 0.5;
      const offsetX = Math.sin(seed) * 0.22;
      const offsetY = Math.cos(seed * 1.3) * 0.22;
      const cx = 0.5 + offsetX;
      const cy = 0.5 + offsetY;
      const rotation = Math.sin(seed * 0.7) * 12; // ±12°
      transforms.push({
        x: cx - cellSize / 2,
        y: cy - cellSize / 2,
        width: cellSize,
        height: cellSize,
        rotation,
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

/** stack: images stacked with a slight offset, like a pile. */
const stackLayout: LayoutDefinition = {
  id: 'stack',
  name: 'Stack',
  minAssets: 2,
  maxAssets: 8,
  computeTransforms: (assetCount) => {
    const size = 0.62;
    const step = 0.05;
    const transforms: AssetTransform[] = [];
    const baseX = (1 - size) / 2;
    const baseY = (1 - size) / 2;
    for (let i = 0; i < assetCount; i++) {
      // Alternate the offset direction so the pile feels organic.
      const dir = i % 2 === 0 ? 1 : -1;
      const offset = i * step * 0.5;
      transforms.push({
        x: baseX + offset * dir,
        y: baseY - offset * 0.6,
        width: size,
        height: size,
        rotation: dir * (i * 2.5),
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

/**
 * magazine: 1 hero + smaller images arranged around it.
 * Hero on the left, smaller images in a column on the right.
 */
const magazineLayout: LayoutDefinition = {
  id: 'magazine',
  name: 'Magazine',
  minAssets: 3,
  maxAssets: 7,
  computeTransforms: (assetCount) => {
    const transforms: AssetTransform[] = [];
    if (assetCount === 0) return transforms;

    const heroW = 0.55;
    const heroH = 0.96;
    transforms.push({
      x: GAP,
      y: (1 - heroH) / 2,
      width: heroW,
      height: heroH,
      rotation: 0,
      zIndex: 1,
    });

    const remaining = assetCount - 1;
    if (remaining > 0) {
      const colX = heroW + GAP * 1.5;
      const colW = 1 - colX - GAP;
      const slotH = (heroH - GAP * (remaining - 1)) / remaining;
      for (let i = 0; i < remaining; i++) {
        transforms.push({
          x: colX,
          y: (1 - heroH) / 2 + i * (slotH + GAP),
          width: colW,
          height: slotH,
          rotation: 0,
          zIndex: i + 2,
        });
      }
    }
    return transforms;
  },
};

/** minimal: 1–2 images with lots of negative space. */
const minimalLayout: LayoutDefinition = {
  id: 'minimal',
  name: 'Minimal',
  minAssets: 1,
  maxAssets: 2,
  computeTransforms: (assetCount) => {
    const size = 0.5;
    const transforms: AssetTransform[] = [];
    if (assetCount === 1) {
      transforms.push({
        x: (1 - size) / 2,
        y: (1 - size) / 2,
        width: size,
        height: size,
        rotation: 0,
        zIndex: 1,
      });
    } else {
      // Two small images, diagonally placed with negative space.
      transforms.push(
        {
          x: 0.12,
          y: 0.16,
          width: size * 0.8,
          height: size * 0.8,
          rotation: 0,
          zIndex: 1,
        },
        {
          x: 0.52,
          y: 0.5,
          width: size * 0.8,
          height: size * 0.8,
          rotation: 0,
          zIndex: 2,
        },
      );
    }
    return transforms;
  },
};

const splitScreenLayout: LayoutDefinition = {
  id: 'split-screen',
  name: 'Split Screen',
  minAssets: 2,
  maxAssets: 2,
  computeTransforms: (assetCount) => {
    const h = 0.49;
    const transforms: AssetTransform[] = [];
    for (let i = 0; i < Math.min(assetCount, 2); i++) {
      transforms.push({
        x: 0,
        y: i === 0 ? 0 : 0.51,
        width: 1,
        height: h,
        rotation: 0,
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

const polaroidLayout: LayoutDefinition = {
  id: 'polaroid',
  name: 'Polaroid',
  minAssets: 2,
  maxAssets: 4,
  computeTransforms: (assetCount) => {
    const w = 0.4;
    const h = 0.5;
    const offsets = [
      { x: 0.08, y: 0.1 },
      { x: 0.52, y: 0.18 },
      { x: 0.16, y: 0.48 },
      { x: 0.5, y: 0.42 },
    ];
    const rotations = [-5, 4, -3, 5];
    const transforms: AssetTransform[] = [];
    for (let i = 0; i < Math.min(assetCount, 4); i++) {
      transforms.push({
        x: offsets[i].x,
        y: offsets[i].y,
        width: w,
        height: h,
        rotation: rotations[i],
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

const verticalStripLayout: LayoutDefinition = {
  id: 'vertical-strip',
  name: 'Vertical Strip',
  minAssets: 2,
  maxAssets: 4,
  computeTransforms: (assetCount) => {
    const n = Math.min(assetCount, 4);
    const gap = 0.02;
    const cellH = (1 - gap * (n - 1)) / n;
    const transforms: AssetTransform[] = [];
    for (let i = 0; i < n; i++) {
      transforms.push({
        x: 0,
        y: i * (cellH + gap),
        width: 1,
        height: cellH,
        rotation: 0,
        zIndex: i + 1,
      });
    }
    return transforms;
  },
};

const mosaicLayout: LayoutDefinition = {
  id: 'mosaic',
  name: 'Mosaic',
  minAssets: 3,
  maxAssets: 5,
  computeTransforms: (assetCount) => {
    const transforms: AssetTransform[] = [];
    if (assetCount === 0) return transforms;

    const heroW = 0.6;
    transforms.push({
      x: 0,
      y: 0,
      width: heroW,
      height: 1,
      rotation: 0,
      zIndex: 1,
    });

    const remaining = Math.min(assetCount - 1, 4);
    if (remaining > 0) {
      const colX = heroW + GAP;
      const colW = 1 - colX - GAP;
      const slotH = (1 - GAP * (remaining - 1)) / remaining;
      for (let i = 0; i < remaining; i++) {
        transforms.push({
          x: colX,
          y: i * (slotH + GAP),
          width: colW,
          height: slotH,
          rotation: 0,
          zIndex: i + 2,
        });
      }
    }
    return transforms;
  },
};

// ── Registry ────────────────────────────────────────────────────────

export const LAYOUT_DEFINITIONS: Record<LayoutId, LayoutDefinition> = {
  editorial: editorialLayout,
  grid: gridLayout,
  hero: heroLayout,
  pair: pairLayout,
  scatter: scatterLayout,
  stack: stackLayout,
  magazine: magazineLayout,
  minimal: minimalLayout,
  'split-screen': splitScreenLayout,
  polaroid: polaroidLayout,
  'vertical-strip': verticalStripLayout,
  mosaic: mosaicLayout,
};

/** Order used when generating alternatives. */
const ALL_LAYOUT_IDS: LayoutId[] = [
  'hero',
  'pair',
  'editorial',
  'grid',
  'magazine',
  'scatter',
  'stack',
  'minimal',
  'split-screen',
  'polaroid',
  'vertical-strip',
  'mosaic',
];

function layoutFits(layout: LayoutDefinition, assetCount: number): boolean {
  if (assetCount < layout.minAssets) return false;
  return true;
}

export function computeOverflow(totalAssets: number, maxAssets: number): number {
  return Math.max(0, totalAssets - maxAssets);
}

function buildPreview(
  id: LayoutId,
  assetCount: number,
  canvasWidth: number,
  canvasHeight: number,
): LayoutPreview {
  const def = LAYOUT_DEFINITIONS[id];
  const cappedCount = Math.min(assetCount, def.maxAssets);
  const transforms = def.computeTransforms(cappedCount, canvasWidth, canvasHeight);
  const overflow = computeOverflow(assetCount, def.maxAssets);
  if (overflow > 0 && transforms.length > 0) {
    const last = transforms[transforms.length - 1];
    transforms.push({
      x: last.x,
      y: last.y,
      width: last.width,
      height: last.height,
      rotation: last.rotation,
      zIndex: last.zIndex + 1,
      overflowCount: overflow,
    });
  }
  return {
    id,
    name: def.name,
    transforms,
    score: scoreLayout(transforms, id, canvasWidth, canvasHeight),
  };
}

// ── Layout scoring ──────────────────────────────────────────────────
// Per §8.3: score layouts using aspect, overlap, negative space, and
// product-label safety. Salience and object category require a backend
// vision model not yet installed — aspect ratio is used as a proxy.
//
// The score is a weighted sum of sub-scores, each normalised to 0–1:
//   aspectFit (0.30) — how well each cell's aspect ratio matches a
//                       typical 4:5 portrait media asset.
//   overlap   (0.25) — penalise unintended overlap (lower for
//                       intentionally overlapping layouts like scatter/stack).
//   negativeSpace (0.20) — reward balanced canvas coverage (not too
//                          sparse, not too crammed).
//   productLabelSafety (0.25) — ensure cells leave room for product
//                                tag overlays near the bottom edge.
//
// The score is informational — it ranks alternatives so the best-
// fitting composition is presented first. The creator always has the
// final say (§8.3: auto-layout is an editable starting proposal).

/** Target aspect ratio for creator media (4:5 portrait, the dominant crop). */
const TARGET_ASPECT = 0.8;

/** Layouts that intentionally overlap — overlap is not penalised. */
const OVERLAP_LAYOUTS: LayoutId[] = ['scatter', 'stack', 'polaroid'];

/**
 * Layouts whose cell shapes are an intentional design choice rather than a
 * 4:5 portrait fit. These receive a fixed aspect sub-score so the generic
 * aspect-fit penalty doesn't mis-rank them.
 */
const ASPECT_OVERRIDE: Partial<Record<LayoutId, number>> = {
  'split-screen': 0.9,
  'vertical-strip': 0.85,
  mosaic: 0.85,
};

function scoreLayout(
  transforms: AssetTransform[],
  layoutId: LayoutId,
  _canvasWidth: number,
  _canvasHeight: number,
): number {
  const scoringTransforms = transforms.filter((t) => t.overflowCount === undefined);
  if (scoringTransforms.length === 0) return 0;

  // ── Aspect fit (0.30) ──
  // Each cell's aspect ratio (w/h) should be close to the target 4:5.
  // Square cells are acceptable; extreme aspect ratios are penalised.
  let aspectScore: number;
  if (ASPECT_OVERRIDE[layoutId] !== undefined) {
    aspectScore = ASPECT_OVERRIDE[layoutId]!;
  } else {
    aspectScore = 0;
    for (const t of scoringTransforms) {
      const cellAspect = t.width / t.height;
      const diff = Math.abs(cellAspect - TARGET_ASPECT);
      // 0 diff = 1.0, 0.5 diff = 0.5, 1.0+ diff = 0
      aspectScore += Math.max(0, 1 - diff * 2);
    }
    aspectScore /= scoringTransforms.length;
  }

  // ── Overlap (0.25) ──
  // For non-overlap layouts, penalise any intersection between cells.
  // For overlap layouts (scatter, stack, polaroid), this sub-score is neutral (0.75).
  let overlapScore: number;
  if (OVERLAP_LAYOUTS.includes(layoutId)) {
    overlapScore = 0.75; // neutral — overlap is intentional
  } else {
    let totalOverlap = 0;
    let totalArea = 0;
    for (let i = 0; i < scoringTransforms.length; i++) {
      const a = scoringTransforms[i];
      totalArea += a.width * a.height;
      for (let j = i + 1; j < scoringTransforms.length; j++) {
        const b = scoringTransforms[j];
        const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        totalOverlap += ox * oy;
      }
    }
    // Overlap ratio: 0 = no overlap (score 1), 0.3+ = heavy overlap (score 0).
    const overlapRatio = totalArea > 0 ? totalOverlap / totalArea : 0;
    overlapScore = Math.max(0, 1 - overlapRatio * 3);
  }

  // ── Negative space (0.20) ──
  // Reward layouts that use 60–90% of the canvas area. Too sparse (<40%)
  // or too crammed (>95%) are penalised.
  let totalCoverage = 0;
  for (const t of scoringTransforms) {
    totalCoverage += t.width * t.height;
  }
  const coverage = Math.min(1, totalCoverage); // cap at 100%
  let negativeSpaceScore: number;
  if (coverage >= 0.6 && coverage <= 0.9) {
    negativeSpaceScore = 1.0; // ideal range
  } else if (coverage >= 0.4 && coverage < 0.6) {
    negativeSpaceScore = 0.7; // slightly sparse
  } else if (coverage > 0.9 && coverage <= 1.0) {
    negativeSpaceScore = 0.6; // slightly crammed
  } else if (coverage < 0.4) {
    negativeSpaceScore = 0.4; // too sparse
  } else {
    negativeSpaceScore = 0.3; // overflow
  }

  // ── Product-label safety (0.25) ──
  // Product tags are typically placed near the bottom-center of each
  // media cell. Penalise cells where the bottom 15% of the cell is
  // clipped by the canvas boundary (y + height > 0.95).
  let labelSafetyScore = 0;
  for (const t of scoringTransforms) {
    const bottomEdge = t.y + t.height;
    if (bottomEdge <= 0.95) {
      labelSafetyScore += 1.0;
    } else {
      // Partial penalty based on how much is clipped.
      const clipAmount = Math.min(1, (bottomEdge - 0.95) / 0.1);
      labelSafetyScore += Math.max(0, 1 - clipAmount);
    }
  }
  labelSafetyScore /= scoringTransforms.length;

  // Weighted sum.
  return (
    aspectScore * 0.30 +
    overlapScore * 0.25 +
    negativeSpaceScore * 0.20 +
    labelSafetyScore * 0.25
  );
}

/**
 * Pick the best default layout for the given asset count:
 *   1 asset  → hero
 *   2 assets → pair
 *   3 assets → editorial
 *   4 assets → grid
 *   5–6      → magazine (falls back to scatter)
 *   7+       → grid
 */
function pickDefaultId(assetCount: number): LayoutId {
  if (assetCount <= 1) return 'hero';
  if (assetCount === 2) return 'pair';
  if (assetCount === 3) return 'editorial';
  if (assetCount === 4) return 'grid';
  if (assetCount <= 6) return 'magazine';
  return 'grid';
}

/**
 * Auto-compose a set of layout previews for the given assets.
 *
 * Returns a default layout (the best fit for the asset count) plus 4–8
 * alternative layouts that also work with the asset count, ordered with the
 * default first then by registry order.
 */
export function autoCompose(
  assetUris: string[],
  canvasWidth: number,
  canvasHeight: number,
): { defaultLayout: LayoutPreview; alternatives: LayoutPreview[] } {
  const assetCount = assetUris.length;

  if (assetCount === 0) {
    // Degenerate case — return hero with an empty transform set so callers
    // can still render an empty preview rail without crashing.
    const empty = buildPreview('hero', 0, canvasWidth, canvasHeight);
    return { defaultLayout: empty, alternatives: [] };
  }

  const defaultId = pickDefaultId(assetCount);
  const defaultLayout = buildPreview(defaultId, assetCount, canvasWidth, canvasHeight);

  const alternatives: LayoutPreview[] = [];
  for (const id of ALL_LAYOUT_IDS) {
    if (id === defaultId) continue;
    const def = LAYOUT_DEFINITIONS[id];
    if (!layoutFits(def, assetCount)) continue;
    alternatives.push(buildPreview(id, assetCount, canvasWidth, canvasHeight));
  }

  // Sort alternatives by score (highest first) so the best-fitting
  // compositions are presented first in the preview rail (§8.3).
  alternatives.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return { defaultLayout, alternatives };
}
