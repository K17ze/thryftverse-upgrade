/**
 * Filter-domain types + option constants — single source of truth for the
 * search, category and browse surfaces. Mirrors mobile filterTypes.ts.
 */

import type { Listing, ListingCondition } from '@/lib/contracts/domain';

export type SortKey = 'relevance' | 'newest' | 'price-asc' | 'price-desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

export const CONDITION_OPTIONS: ListingCondition[] = [
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
];

export interface ListingFilters {
  conditions: ListingCondition[];
  priceMin: number | null;
  priceMax: number | null;
  /** Category slug — null means any category. */
  category: string | null;
  size: string;
  brand: string;
}

export const EMPTY_FILTERS: ListingFilters = {
  conditions: [],
  priceMin: null,
  priceMax: null,
  category: null,
  size: '',
  brand: '',
};

/** Badge count on the filter entry point — grouped facets count once. */
export function countActiveFilters(f: ListingFilters): number {
  return (
    f.conditions.length +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    (f.category ? 1 : 0) +
    (f.size.trim() ? 1 : 0) +
    (f.brand.trim() ? 1 : 0)
  );
}

export function applyListingFilters(
  listings: Listing[],
  f: ListingFilters,
): Listing[] {
  const size = f.size.trim().toLowerCase();
  const brand = f.brand.trim().toLowerCase();
  return listings.filter((l) => {
    if (f.conditions.length > 0 && !f.conditions.includes(l.condition)) {
      return false;
    }
    if (f.priceMin != null && l.price < f.priceMin) return false;
    if (f.priceMax != null && l.price > f.priceMax) return false;
    if (f.category && l.category.toLowerCase() !== f.category.toLowerCase()) {
      return false;
    }
    if (size && !(l.size ?? '').toLowerCase().includes(size)) return false;
    if (brand && !(l.brand ?? '').toLowerCase().includes(brand)) return false;
    return true;
  });
}

export function sortListings(listings: Listing[], sort: SortKey): Listing[] {
  if (sort === 'relevance') return listings;
  const out = [...listings];
  switch (sort) {
    case 'newest':
      out.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );
      break;
    case 'price-asc':
      out.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      out.sort((a, b) => b.price - a.price);
      break;
  }
  return out;
}
