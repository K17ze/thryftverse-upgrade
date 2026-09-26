/**
 * Closet filter view-model — pure projections over a seller's listings.
 * Mirrors frontend/src/domain/closet.ts (search + brand + sort) extended
 * with the facet set the web closet exposes: size, condition, category.
 * Facets are always derived from the seller's own items, so counts are
 * honest and dead options never render.
 */

import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { CATEGORIES } from '@/lib/data/fixtures';
import { CONDITION_OPTIONS } from '@/components/filters/filterTypes';

export type ClosetSortKey = 'newest' | 'price-asc' | 'price-desc' | 'most-liked';

export const CLOSET_SORT_OPTIONS: { value: ClosetSortKey; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'most-liked', label: 'Most liked' },
];

export interface ClosetFilters {
  /** "Search this closet" — matches title and brand. */
  query: string;
  /** Single-select brand, toggled from the chip rail (mobile parity). */
  brand: string | null;
  sizes: string[];
  conditions: ListingCondition[];
  /** Category slug — null means any. */
  category: string | null;
}

export const EMPTY_CLOSET_FILTERS: ClosetFilters = {
  query: '',
  brand: null,
  sizes: [],
  conditions: [],
  category: null,
};

export interface ClosetFacet<T = string> {
  value: T;
  label: string;
  /** Items in the current closet set carrying this value. */
  count: number;
}

export interface ClosetFacets {
  brands: ClosetFacet[];
  sizes: ClosetFacet[];
  conditions: ClosetFacet<ListingCondition>[];
  categories: ClosetFacet[];
}

const CATEGORY_NAMES = new Map(CATEGORIES.map((c) => [c.slug, c.name]));

export function categoryLabel(slug: string): string {
  return CATEGORY_NAMES.get(slug) ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function tally(
  items: Listing[],
  pick: (l: Listing) => string | null | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of items) {
    const key = pick(l);
    if (key && key.trim().length > 0) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Facets for the filter rail + sheet, derived from the visible closet set. */
export function extractClosetFacets(items: Listing[]): ClosetFacets {
  const brands = [...tally(items, (l) => l.brand).entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const sizes = [...tally(items, (l) => l.size).entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const conditionCounts = tally(items, (l) => l.condition);
  const conditions = CONDITION_OPTIONS.filter((c) => conditionCounts.has(c)).map(
    (c) => ({ value: c, label: c, count: conditionCounts.get(c) ?? 0 }),
  );

  const categories = [...tally(items, (l) => l.category).entries()]
    .map(([value, count]) => ({ value, label: categoryLabel(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { brands, sizes, conditions, categories };
}

/** A facet only earns a control when choosing between options is possible. */
export function facetHasChoice(facet: ClosetFacet<unknown>[]): boolean {
  return facet.length >= 2;
}

export function applyClosetFilters(items: Listing[], f: ClosetFilters): Listing[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((l) => {
    if (
      q &&
      !l.title.toLowerCase().includes(q) &&
      !(l.brand ?? '').toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.brand && l.brand !== f.brand) return false;
    if (f.sizes.length > 0 && !(l.size != null && f.sizes.includes(l.size))) {
      return false;
    }
    if (f.conditions.length > 0 && !f.conditions.includes(l.condition)) return false;
    if (f.category && l.category !== f.category) return false;
    return true;
  });
}

const createdTs = (l: Listing): number => {
  const t = l.createdAt ? Date.parse(l.createdAt) : 0;
  return Number.isNaN(t) ? 0 : t;
};

export function sortClosetListings(items: Listing[], sort: ClosetSortKey): Listing[] {
  const out = [...items];
  switch (sort) {
    case 'price-asc':
      return out.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return out.sort((a, b) => b.price - a.price);
    case 'most-liked':
      return out.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    case 'newest':
    default:
      return out.sort((a, b) => createdTs(b) - createdTs(a));
  }
}

/** Badge on the Filters button — facet selections only (search lives in its own field). */
export function countClosetFacetFilters(f: ClosetFilters): number {
  return (
    (f.brand ? 1 : 0) +
    f.sizes.length +
    f.conditions.length +
    (f.category ? 1 : 0)
  );
}

/** Any narrowing at all — drives the active-chips row and scoped empty state. */
export function countActiveClosetFilters(f: ClosetFilters): number {
  return countClosetFacetFilters(f) + (f.query.trim() ? 1 : 0);
}
