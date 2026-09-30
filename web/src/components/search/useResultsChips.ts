'use client';

/**
 * useResultsChips — derives active filter chips for applied facets:
 * conditions, price bounds, categories, sizes, brands, colours, and sold items.
 * Each chip provides an immediate onRemove action that updates the filter set.
 */

import { useMemo } from 'react';
import type { ListingFilters } from '@/components/filters/filterTypes';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';
import type { ResultsChip } from './ActiveFilterChips';

/** Swatch lookup for colour chips — kept off the render path. */
const COLOUR_SWATCHES = new Map(
  COLOR_VOCAB.map((c) => [c.name, `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})`]),
);

interface UseResultsChipsOptions {
  filters: ListingFilters;
  onFiltersChange: (next: ListingFilters) => void;
  categoryName: (slug: string) => string;
}

export function useResultsChips({
  filters,
  onFiltersChange,
  categoryName,
}: UseResultsChipsOptions): ResultsChip[] {
  return useMemo<ResultsChip[]>(() => {
    const set = (next: Partial<ListingFilters>) =>
      onFiltersChange({ ...filters, ...next });
    const dropValue = (list: string[], v: string) =>
      list.filter((x) => x.toLowerCase() !== v.toLowerCase());

    const out: ResultsChip[] = filters.conditions.map((c) => ({
      key: `condition:${c}`,
      label: c,
      onRemove: () =>
        set({ conditions: filters.conditions.filter((x) => x !== c) }),
    }));

    if (filters.priceMin != null || filters.priceMax != null) {
      const label =
        filters.priceMin != null && filters.priceMax != null
          ? `£${filters.priceMin}–£${filters.priceMax}`
          : filters.priceMax != null
            ? `Under £${filters.priceMax}`
            : `£${filters.priceMin}+`;
      out.push({
        key: 'price',
        label,
        onRemove: () => set({ priceMin: null, priceMax: null }),
      });
    }

    for (const slug of filters.categories) {
      out.push({
        key: `category:${slug}`,
        label: categoryName(slug),
        onRemove: () => set({ categories: dropValue(filters.categories, slug) }),
      });
    }

    for (const s of filters.sizes) {
      if (!s.trim()) continue;
      out.push({
        key: `size:${s.toLowerCase()}`,
        label: `Size ${s.trim()}`,
        onRemove: () => set({ sizes: dropValue(filters.sizes, s) }),
      });
    }

    for (const b of filters.brands) {
      if (!b.trim()) continue;
      out.push({
        key: `brand:${b.toLowerCase()}`,
        label: b.trim(),
        onRemove: () => set({ brands: dropValue(filters.brands, b) }),
      });
    }

    for (const c of filters.colours) {
      out.push({
        key: `colour:${c.toLowerCase()}`,
        label: c,
        swatch: COLOUR_SWATCHES.get(c) ?? undefined,
        onRemove: () => set({ colours: dropValue(filters.colours, c) }),
      });
    }

    if (filters.includeSold) {
      out.push({
        key: 'sold',
        label: 'Sold items',
        onRemove: () => set({ includeSold: false }),
      });
    }

    return out;
  }, [filters, onFiltersChange, categoryName]);
}
