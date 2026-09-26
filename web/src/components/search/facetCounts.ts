/**
 * Facet counting — real counts from the current result set, computed with
 * exactly the matching semantics of applyListingFilters. For each facet
 * group the base set is "listings passing every other active filter", so
 * each option's count is what the grid would actually show after clicking
 * it (eBay refinement-rail behaviour — no fabricated tallies).
 */

import type { Listing } from '@/lib/contracts/domain';
import { CONDITION_OPTIONS, type ListingFilters } from '@/components/filters/filterTypes';

export type FacetGroupKey = 'category' | 'brand' | 'size' | 'condition';

export interface FacetOption {
  /** Value written into ListingFilters when selected. */
  value: string;
  label: string;
  count: number;
}

/** Listings passing every filter except the named group's dimension. */
function baseExcept(
  listings: Listing[],
  filters: ListingFilters,
  group: FacetGroupKey,
): Listing[] {
  const size = filters.size.trim().toLowerCase();
  const brand = filters.brand.trim().toLowerCase();
  return listings.filter((l) => {
    if (
      group !== 'condition' &&
      filters.conditions.length > 0 &&
      !filters.conditions.includes(l.condition)
    ) {
      return false;
    }
    if (filters.priceMin != null && l.price < filters.priceMin) return false;
    if (filters.priceMax != null && l.price > filters.priceMax) return false;
    if (
      group !== 'category' &&
      filters.category &&
      l.category.toLowerCase() !== filters.category.toLowerCase()
    ) {
      return false;
    }
    if (group !== 'size' && size && !(l.size ?? '').toLowerCase().includes(size)) {
      return false;
    }
    if (group !== 'brand' && brand && !(l.brand ?? '').toLowerCase().includes(brand)) {
      return false;
    }
    return true;
  });
}

/** Tally helper — counts keyed by lowercase value. */
function tally(listings: Listing[], key: (l: Listing) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of listings) {
    const k = key(l);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Category options — one entry per category present in the result set,
 * ordered by the caller's taxonomy map (department order), zero-count
 * categories omitted.
 */
export function categoryFacets(
  listings: Listing[],
  filters: ListingFilters,
  names: Map<string, string>,
): FacetOption[] {
  const base = baseExcept(listings, filters, 'category');
  const counts = tally(base, (l) => l.category.toLowerCase());
  const options: FacetOption[] = [];
  for (const [slug, label] of names) {
    const count = counts.get(slug);
    if (count) options.push({ value: slug, label, count });
  }
  return options;
}

/** Brand options — distinct values, includes-matched counts, busiest first. */
export function brandFacets(
  listings: Listing[],
  filters: ListingFilters,
): FacetOption[] {
  const base = baseExcept(listings, filters, 'brand');
  const seen = new Map<string, string>(); // lowercase → display value
  for (const l of base) {
    const brand = l.brand?.trim();
    if (!brand) continue;
    const key = brand.toLowerCase();
    if (!seen.has(key)) seen.set(key, brand);
  }
  return [...seen.entries()]
    .map(([key, label]) => ({
      value: key,
      label,
      // Options must reflect what a click selects — brand filters match
      // by substring, so the count uses the same rule.
      count: base.filter((l) => (l.brand ?? '').toLowerCase().includes(key)).length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Size options — distinct sizes with substring-matched counts, busiest
 * first. Sizes are free-text in the fixtures ("M", "UK 9", "W32 L32"),
 * so the count mirrors the substring rule the filter applies.
 */
export function sizeFacets(
  listings: Listing[],
  filters: ListingFilters,
): FacetOption[] {
  const base = baseExcept(listings, filters, 'size');
  const seen = new Map<string, string>(); // lowercase → display value
  for (const l of base) {
    const s = l.size?.trim();
    if (s) seen.set(s.toLowerCase(), s);
  }
  return [...seen.entries()]
    .map(([key, label]) => ({
      value: key,
      label,
      count: base.filter((l) => (l.size ?? '').toLowerCase().includes(key)).length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Condition options — canonical order, zero-count entries omitted. */
export function conditionFacets(
  listings: Listing[],
  filters: ListingFilters,
): FacetOption[] {
  const base = baseExcept(listings, filters, 'condition');
  const counts = tally(base, (l) => l.condition);
  return CONDITION_OPTIONS.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => ({
    value: c,
    label: c,
    count: counts.get(c) ?? 0,
  }));
}
