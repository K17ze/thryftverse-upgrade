'use client';

import { useMemo } from 'react';
import { useCategoryDirectory } from '@/components/search/useCategoryDirectory';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import {
  categoryFacets,
  colourFacets,
  conditionFacets,
  optionsWithSelected,
  soldFacetCount,
  type FacetOption,
} from '@/components/search/facetCounts';
import type { ListingFilters } from './filterTypes';

export function useFilterSheetWorkflow(
  listings: Listing[],
  filters: ListingFilters,
  onChange: (next: ListingFilters) => void,
) {
  const { categories: directoryCategories } = useCategoryDirectory();

  const categoryNames = useMemo(
    () =>
      new Map(
        directoryCategories.flatMap((c) => [
          [c.slug, c.name] as const,
          [c.name.toLowerCase(), c.name] as const,
        ]),
      ),
    [directoryCategories],
  );

  const categoryCanonical = useMemo(
    () =>
      new Map(
        directoryCategories.flatMap((c) => [
          [c.slug, c.slug] as const,
          [c.name.toLowerCase(), c.slug] as const,
        ]),
      ),
    [directoryCategories],
  );

  const conditionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of conditionFacets(listings, filters)) {
      counts.set(o.value, o.count);
    }
    return counts;
  }, [listings, filters]);

  const categoryOptions = useMemo<FacetOption[]>(() => {
    const options = categoryFacets(listings, filters, categoryNames, categoryCanonical);
    for (const slug of filters.categories) {
      const canonical = categoryCanonical.get(slug.toLowerCase()) ?? slug.toLowerCase();
      if (!options.some((o) => o.value === canonical)) {
        options.push({
          value: canonical,
          label: categoryNames.get(canonical) ?? categoryNames.get(slug.toLowerCase()) ?? slug,
          count: 0,
        });
      }
    }
    return options;
  }, [listings, filters, categoryNames, categoryCanonical]);

  const canonicalCategory = (c: string) =>
    categoryCanonical.get(c.toLowerCase()) ?? c.toLowerCase();

  const toggleCategory = (value: string) => {
    const selected = filters.categories.some((c) => canonicalCategory(c) === value);
    onChange({
      ...filters,
      categories: selected
        ? filters.categories.filter((c) => canonicalCategory(c) !== value)
        : [...filters.categories, value],
    });
  };

  const brandOptions = useMemo(
    () => optionsWithSelected(listings, filters, 'brand'),
    [listings, filters],
  );
  const sizeOptions = useMemo(
    () => optionsWithSelected(listings, filters, 'size'),
    [listings, filters],
  );
  const colourOptions = useMemo(
    () => colourFacets(listings, filters),
    [listings, filters],
  );
  const soldCount = useMemo(
    () => soldFacetCount(listings, filters),
    [listings, filters],
  );

  const toggleCondition = (c: ListingCondition) => {
    const on = filters.conditions.includes(c);
    onChange({
      ...filters,
      conditions: on
        ? filters.conditions.filter((x) => x !== c)
        : [...filters.conditions, c],
    });
  };

  const setPrice = (key: 'priceMin' | 'priceMax', raw: string) => {
    if (raw === '') {
      onChange({ ...filters, [key]: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) onChange({ ...filters, [key]: n });
  };

  return {
    categoryOptions,
    canonicalCategory,
    toggleCategory,
    brandOptions,
    sizeOptions,
    colourOptions,
    conditionCounts,
    soldCount,
    toggleCondition,
    setPrice,
  };
}
