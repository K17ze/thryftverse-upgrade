/**
 * Density modes — department-specific information density for page shells.
 *
 * The generic FlagshipScreen uses a single content padding / row rhythm for
 * every surface, which is why 108+ screens feel templated. These configs give
 * each department a deliberate density posture:
 *
 *  - compact   — inbox, inventory, analytics rows. More useful rows per
 *                viewport; hairlines and spacing do the separating work.
 *  - regular   — settings, seller hub, checkout. Comfortable touch targets
 *                with room for a current value / consequence beside each row.
 *  - editorial — PDP, discovery detail. Media-first; content sheet breathes
 *                around a single dominant object.
 *
 * Per AGENTS.md §4: density is about composition and rhythm, not decoration.
 * No density mode adds shadows, cards, or chrome — it only adjusts geometry.
 */
export type Density = 'compact' | 'regular' | 'editorial';

export interface DensityConfig {
  /** Touch target height for rows */
  rowHeight: number;
  /** Vertical padding within a row */
  rowVerticalPadding: number;
  /** Gap between rows in a list */
  rowGap: number;
  /** Horizontal screen gutter */
  gutter: number;
  /** Gap between sections */
  sectionGap: number;
  /** Media aspect ratio default */
  mediaAspectRatio: number | 'native';
  /** Card radius for this density */
  cardRadius: number;
}

export const DENSITY_CONFIGS: Record<Density, DensityConfig> = {
  compact: {
    rowHeight: 56,
    rowVerticalPadding: 8,
    rowGap: 0,
    gutter: 16,
    sectionGap: 16,
    mediaAspectRatio: 1,
    cardRadius: 8,
  },
  regular: {
    rowHeight: 64,
    rowVerticalPadding: 12,
    rowGap: 8,
    gutter: 16,
    sectionGap: 24,
    mediaAspectRatio: 4 / 5,
    cardRadius: 12,
  },
  editorial: {
    rowHeight: 80,
    rowVerticalPadding: 16,
    rowGap: 16,
    gutter: 20,
    sectionGap: 32,
    mediaAspectRatio: 3 / 4,
    cardRadius: 16,
  },
};

export function useDensity(density: Density): DensityConfig {
  return DENSITY_CONFIGS[density];
}
