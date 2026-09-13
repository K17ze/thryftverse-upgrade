import { Space } from '../../theme/designTokens';
import type { GalleriaFeaturedAsset } from '../../services/galleriaApi';

// ── Layout constants ──
// Collection rail card dimensions — intentional design constants:
// 200pt width balances cover-image legibility with ~3 cards visible per viewport;
// 260pt height gives the cover image room to breathe while keeping curator meta compact.
export const COLLECTION_CARD_WIDTH = 200;
export const COLLECTION_CARD_HEIGHT = 260;
export const MASONRY_GAP = Space.sm;
export const MASONRY_COLUMN_COUNT = 2;
export const MASONRY_PADDING = Space.md;

// Skeleton height variation communicates loading without inventing media geometry.
export const SKELETON_ASPECT_RATIOS = [1.25, 1.0, 1.32, 0.92] as const;

/**
 * Masonry column width — product-identity geometry. Single source of truth
 * shared by the featured-asset card and the masonry skeleton.
 */
export function getMasonryColumnWidth(screenWidth: number): number {
  return (
    (screenWidth - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
    MASONRY_COLUMN_COUNT
  );
}

// ---------------------------------------------------------------------------
// Masonry layout — true Pinterest-style column assignment by shortest height
// ---------------------------------------------------------------------------
export function buildMasonryColumns(
  items: GalleriaFeaturedAsset[],
  colWidth: number,
): GalleriaFeaturedAsset[][] {
  const cols: GalleriaFeaturedAsset[][] = Array.from({ length: MASONRY_COLUMN_COUNT }, () => []);
  const heights = Array.from({ length: MASONRY_COLUMN_COUNT }, () => 0);

  items.forEach((item) => {
    const imgHeight = Math.round(colWidth * item.aspectRatio);
    const metaHeight = 72; // approximate: collection + title(2 lines) + valuation
    const itemHeight = imgHeight + metaHeight + MASONRY_GAP;

    let shortestCol = 0;
    let shortestHeight = heights[0];
    for (let c = 1; c < MASONRY_COLUMN_COUNT; c++) {
      if (heights[c] < shortestHeight) {
        shortestCol = c;
        shortestHeight = heights[c];
      }
    }
    cols[shortestCol].push(item);
    heights[shortestCol] += itemHeight;
  });

  return cols;
}
