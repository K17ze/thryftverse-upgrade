/**
 * Facet counting — real counts from the current result set, computed with
 * exactly the matching semantics of applyListingFilters. For each facet
 * group the base set is "listings passing every other active filter", so
 * each option's count is what the grid would actually show after clicking
 * it (eBay refinement-rail behaviour — no fabricated tallies).
 *
 * Facets are multi-select (union within a dimension): a selected option's
 * count is what that option contributes on top of the relaxed base — the
 * same per-option tally eBay and Vinted show against their checkboxes.
 */

import type { Listing } from '@/lib/contracts/domain';
import {
  applyListingFilters,
  CONDITION_OPTIONS,
  listingColourNames,
  type ListingFilters,
} from '@/components/filters/filterTypes';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';

export type FacetGroupKey =
  | 'category'
  | 'brand'
  | 'size'
  | 'condition'
  | 'colour'
  | 'sold';

export interface FacetOption {
  /** Value written into ListingFilters when selected. */
  value: string;
  label: string;
  count: number;
  /** Colour facets carry the vocabulary swatch for a swatch-dot row. */
  swatch?: string;
}

/** Listings passing every filter except the named group's dimension. */
function baseExcept(
  listings: Listing[],
  filters: ListingFilters,
  group: FacetGroupKey,
): Listing[] {
  const brands = filters.brands.map((b) => b.trim().toLowerCase()).filter(Boolean);
  const sizes = filters.sizes.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const categories = filters.categories.map((c) => c.toLowerCase());
  return listings.filter((l) => {
    if (group !== 'sold' && !filters.includeSold && (l.isSold || l.status === 'sold')) {
      return false;
    }
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
      categories.length > 0 &&
      !categories.includes(l.category.toLowerCase())
    ) {
      return false;
    }
    if (
      group !== 'size' &&
      sizes.length > 0 &&
      !sizes.some((s) => (l.size ?? '').toLowerCase().includes(s))
    ) {
      return false;
    }
    if (
      group !== 'brand' &&
      brands.length > 0 &&
      !brands.some((b) => (l.brand ?? '').toLowerCase().includes(b))
    ) {
      return false;
    }
    if (group !== 'colour' && filters.colours.length > 0) {
      const named = listingColourNames(l);
      if (!filters.colours.some((c) => named.includes(c))) return false;
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
 * categories omitted. `names` maps every storable spelling (node id,
 * display name — l.category is mixed-vocabulary) to its label; counts are
 * merged per canonical slug so an id-stored row and a name-stored row
 * land on one option that emits the canonical value.
 */
export function categoryFacets(
  listings: Listing[],
  filters: ListingFilters,
  names: Map<string, string>,
  canonical?: Map<string, string>,
): FacetOption[] {
  const base = baseExcept(listings, filters, 'category');
  const counts = tally(base, (l) => l.category.toLowerCase());
  // Merge every alias's tally into its canonical slug first — id-stored
  // and name-stored rows both count toward the one option.
  const merged = new Map<string, number>();
  for (const [key, count] of counts) {
    const slug = canonical?.get(key) ?? key;
    merged.set(slug, (merged.get(slug) ?? 0) + count);
  }
  const options: FacetOption[] = [];
  const emitted = new Set<string>();
  for (const [key, label] of names) {
    const slug = canonical?.get(key) ?? key;
    if (emitted.has(slug)) continue;
    const count = merged.get(slug);
    if (count) {
      options.push({ value: slug, label, count });
      emitted.add(slug);
    }
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

/**
 * Colour options — the shared COLOR_VOCAB names actually present in the
 * relaxed result set (a listing qualifies only if its own text names the
 * colour — the strict facet rule applyListingFilters applies), with the
 * vocabulary swatch so the option renders as a swatch-dot row.
 */
export function colourFacets(
  listings: Listing[],
  filters: ListingFilters,
): FacetOption[] {
  const base = baseExcept(listings, filters, 'colour');
  const counts = new Map<string, number>();
  for (const l of base) {
    for (const name of listingColourNames(l)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return COLOR_VOCAB.filter((c) => (counts.get(c.name) ?? 0) > 0).map((c) => ({
    value: c.name,
    label: c.name,
    count: counts.get(c.name) ?? 0,
    swatch: `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})`,
  }));
}

/**
 * Sold-count for the availability toggle — the number of sold listings the
 * relaxed set would add (what "Sold items" contributes on this result set).
 */
export function soldFacetCount(
  listings: Listing[],
  filters: ListingFilters,
): number {
  const base = baseExcept(listings, filters, 'sold');
  return base.filter((l) => l.isSold === true || l.status === 'sold').length;
}

/**
 * Options for a multi-select facet — the relaxed-base tally plus, when a
 * URL-seeded value isn't among them, appended selected options carrying
 * their real substring counts (same matching rule as the filter itself)
 * so they stay visible and removable.
 */
export function optionsWithSelected(
  listings: Listing[],
  filters: ListingFilters,
  dim: 'brand' | 'size',
): FacetOption[] {
  const base =
    dim === 'brand'
      ? brandFacets(listings, filters)
      : sizeFacets(listings, filters);
  const selected = dim === 'brand' ? filters.brands : filters.sizes;
  const missing = selected.filter(
    (v) => v.trim() && !base.some((o) => o.value === v.trim().toLowerCase()),
  );
  if (missing.length === 0) return base;
  const relaxed = applyListingFilters(
    listings,
    dim === 'brand'
      ? { ...filters, brands: [] }
      : { ...filters, sizes: [] },
  );
  const extra = missing.map((raw) => {
    const sel = raw.trim().toLowerCase();
    return {
      value: sel,
      label: raw.trim(),
      count: relaxed.filter((l) =>
        (dim === 'brand' ? (l.brand ?? '') : (l.size ?? ''))
          .toLowerCase()
          .includes(sel),
      ).length,
    };
  });
  return [...base, ...extra];
}
