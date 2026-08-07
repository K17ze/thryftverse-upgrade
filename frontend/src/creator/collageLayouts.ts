/**
 * Collage layout helpers — rearrange existing layers into curated compositions.
 *
 * All positions/sizes are normalized 0–1 relative to the canvas, with x/y
 * representing the layer centre (matching the CreatorLayer coordinate system).
 *
 * Layouts operate on visual content layers (media + product). Text, decorative
 * and other non-content layers are preserved; editorial relocates text into a
 * dedicated text area to honour the "one large + one small + text area" brief.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 */
import type { CreatorLayer } from './composition';

/** Normalized gap between grid cells (4% of canvas). */
const GRID_GAP = 0.04;

/** Layers that count as visual content for collage rearrangement. */
function isVisualContentLayer(layer: CreatorLayer): boolean {
  return layer.type === 'media' || layer.type === 'product';
}

/**
 * Evenly space visual content layers into a rows×cols grid.
 * Extra layers wrap to additional rows; fewer layers leave empty cells.
 */
export function applyGridLayout(
  layers: CreatorLayer[],
  rows: number,
  cols: number,
): CreatorLayer[] {
  const visual = layers.filter(isVisualContentLayer);
  const others = layers.filter((l) => !isVisualContentLayer(l));

  const cellW = (1 - GRID_GAP * (cols + 1)) / cols;
  const cellH = (1 - GRID_GAP * (rows + 1)) / rows;

  const laidOut = visual.map((layer, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = GRID_GAP + cellW / 2 + col * (cellW + GRID_GAP);
    const y = GRID_GAP + cellH / 2 + row * (cellH + GRID_GAP);
    return {
      ...layer,
      x,
      y,
      width: cellW,
      height: cellH,
      scale: 1,
      rotation: 0,
      zIndex: i + 1,
    };
  });

  return [...laidOut, ...others];
}

/**
 * Scatter visual content layers around the canvas centre with deterministic
 * pseudo-random offsets and slight rotation. Deterministic by index so the
 * layout is stable across re-renders (no re-shuffle on every paint).
 */
export function applyScatteredLayout(layers: CreatorLayer[]): CreatorLayer[] {
  const visual = layers.filter(isVisualContentLayer);
  const others = layers.filter((l) => !isVisualContentLayer(l));

  const cellSize = 0.34;

  const laidOut = visual.map((layer, i) => {
    // Deterministic pseudo-random derived from index — stable across renders.
    const seed = i * 2.357 + 0.5;
    const offsetX = Math.sin(seed) * 0.2;
    const offsetY = Math.cos(seed * 1.3) * 0.2;
    const rotation = Math.sin(seed * 0.7) * 9; // ±9°
    return {
      ...layer,
      x: 0.5 + offsetX,
      y: 0.5 + offsetY,
      width: cellSize,
      height: cellSize,
      scale: 1,
      rotation,
      zIndex: i + 1,
    };
  });

  return [...laidOut, ...others];
}

/**
 * Editorial collage: one large hero + one small accent + a text area.
 * The first visual layer becomes the hero, the second the accent, and any
 * remaining visuals become a small bottom strip. Text layers relocate to the
 * upper-left text area.
 */
export function applyEditorialLayout(layers: CreatorLayer[]): CreatorLayer[] {
  const visual = layers.filter(isVisualContentLayer);
  const others = layers.filter((l) => !isVisualContentLayer(l));

  const laidOut = visual.map((layer, i) => {
    if (i === 0) {
      // Large hero — left-aligned, upper portion
      return {
        ...layer,
        x: 0.38,
        y: 0.4,
        width: 0.66,
        height: 0.62,
        scale: 1,
        rotation: 0,
        zIndex: 1,
      };
    }
    if (i === 1) {
      // Small accent — lower-right
      return {
        ...layer,
        x: 0.8,
        y: 0.74,
        width: 0.3,
        height: 0.3,
        scale: 1,
        rotation: 0,
        zIndex: 2,
      };
    }
    // Remaining visuals — small bottom strip
    const stripX = 0.18 + (i - 2) * 0.22;
    return {
      ...layer,
      x: Math.min(stripX, 0.82),
      y: 0.9,
      width: 0.18,
      height: 0.12,
      scale: 1,
      rotation: 0,
      zIndex: i + 1,
    };
  });

  // Relocate text layers into the upper-left editorial text area.
  const relocated = others.map((layer, i) => {
    if (layer.type === 'text') {
      return {
        ...layer,
        x: 0.28,
        y: 0.12,
        width: 0.42,
        height: 0.06,
        rotation: 0,
        zIndex: 100 + i,
      };
    }
    return layer;
  });

  return [...laidOut, ...relocated];
}

// ── Preset metadata for the collage picker UI ─────────────────────────

export type CollageLayoutPreset = 'grid-2x2' | 'grid-3x3' | 'scattered' | 'editorial';

export interface CollagePresetOption {
  key: CollageLayoutPreset;
  label: string;
  description: string;
  /** Applies the preset to the given layers and returns the rearranged set. */
  apply: (layers: CreatorLayer[]) => CreatorLayer[];
}

export const COLLAGE_PRESETS: CollagePresetOption[] = [
  {
    key: 'grid-2x2',
    label: '2 × 2',
    description: 'Even four-cell grid',
    apply: (layers) => applyGridLayout(layers, 2, 2),
  },
  {
    key: 'grid-3x3',
    label: '3 × 3',
    description: 'Even nine-cell grid',
    apply: (layers) => applyGridLayout(layers, 3, 3),
  },
  {
    key: 'scattered',
    label: 'Scattered',
    description: 'Loose offsets with rotation',
    apply: (layers) => applyScatteredLayout(layers),
  },
  {
    key: 'editorial',
    label: 'Editorial',
    description: 'Hero + accent + text area',
    apply: (layers) => applyEditorialLayout(layers),
  },
];
