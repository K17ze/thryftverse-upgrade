/**
 * Density modes — 1:1 port of frontend/src/theme/density.ts.
 *
 * Department-specific information density for page shells. Density adjusts
 * geometry only (row height, gutters, section rhythm, media aspect) — it
 * never adds shadows, cards, or chrome (AGENTS.md §4).
 *
 *  - compact   — inbox, inventory, analytics rows. More useful rows per
 *                viewport; hairlines and spacing do the separating work.
 *  - regular   — settings, seller hub, checkout. Comfortable targets with
 *                room for a current value beside each row.
 *  - editorial — PDP, discovery detail. Media-first; the content sheet
 *                breathes around a single dominant object.
 *
 * The active density is applied as `data-density` on <html>; the matching
 * CSS variables live in globals.css (`--density-*`). Surfaces opt in by
 * consuming `var(--density-*)` or by calling `useDensity().config` — the
 * CSS vars are the preferred path so geometry survives SSR/hydration.
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

export const DENSITIES: readonly Density[] = ['compact', 'regular', 'editorial'];

/** Zustand persist key — read pre-paint by the inline script in layout.tsx. */
export const DENSITY_STORAGE_KEY = 'thryftverse.web.density';

export const DEFAULT_DENSITY: Density = 'regular';

export function isDensity(value: unknown): value is Density {
  return value === 'compact' || value === 'regular' || value === 'editorial';
}

export function densityConfig(density: Density): DensityConfig {
  return DENSITY_CONFIGS[density];
}
