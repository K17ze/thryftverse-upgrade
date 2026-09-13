import { useCallback } from 'react';

import { useStore } from '../../store/useStore';

/**
 * Derived filter status for BrowseScreen: whether facet filters are active
 * (drives the "Filter on" pill + badge row), whether any filtering is applied
 * at all (drives the filtered-empty vs regular-empty states), and the
 * clear-all action. Extracted verbatim.
 */
export function useBrowseFilterStatus() {
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);

  const hasActiveFilters =
    browseFilters.brands.length > 0 ||
    browseFilters.sizes.length > 0 ||
    browseFilters.condition !== 'Any' ||
    browseFilters.sustainableOnly ||
    browseFilters.priceMin != null ||
    browseFilters.priceMax != null;

  // Filtered-empty vs. regular empty: user-applied filters (brand, size,
  // condition, sustainable, query, sort) produce a filtered-empty state
  // distinct from "no data at all" for the current category. Per §14,
  // filtered-empty is a normal state, not an error.
  const hasAnyFiltering =
    hasActiveFilters ||
    browseFilters.query.trim().length > 0 ||
    browseFilters.sort !== 'Recommended';

  const handleClearFilters = useCallback(() => {
    updateBrowseFilters({
      query: '',
      sort: 'Recommended',
      brands: [],
      sizes: [],
      condition: 'Any',
      sustainableOnly: false,
      priceMin: null,
      priceMax: null });
  }, [updateBrowseFilters]);

  return { hasActiveFilters, hasAnyFiltering, handleClearFilters };
}
