import { useCallback } from 'react';

import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';

interface UseBrowseSavedSearchOptions {
  searchQuery?: string;
  title: string;
  categoryId: string;
}

/**
 * Save-search state for BrowseScreen: the label shown on the pill, whether
 * the current query+filter combination is already saved, and the save action
 * (writes a saved search with alerts enabled and confirms via toast).
 * Extracted verbatim.
 */
export function useBrowseSavedSearch({
  searchQuery,
  title,
  categoryId }: UseBrowseSavedSearchOptions) {
  const browseFilters = useStore((state) => state.browseFilters);
  const addSavedSearch = useStore((state) => state.addSavedSearch);
  const savedSearches = useStore((state) => state.savedSearches);
  const { show } = useToast();

  // Save search — only available when there's a query or category to save
  const saveSearchLabel = searchQuery || title;
  const isCurrentSaved = savedSearches.some(
    (s) => s.query === saveSearchLabel &&
    s.filters.brands.join(',') === browseFilters.brands.join(',') &&
    s.filters.sizes.join(',') === browseFilters.sizes.join(',') &&
    s.filters.condition === browseFilters.condition
  );

  const handleSaveSearch = useCallback(() => {
    if (!saveSearchLabel || saveSearchLabel === 'Browse All') return;
    addSavedSearch({
      query: saveSearchLabel,
      filters: {
        brands: browseFilters.brands,
        sizes: browseFilters.sizes,
        condition: browseFilters.condition,
        sort: browseFilters.sort,
        category: categoryId !== 'search' && categoryId !== 'all' ? categoryId : undefined },
      alertsEnabled: true });
    show('Search saved with alerts enabled', 'success');
  }, [saveSearchLabel, browseFilters, categoryId, addSavedSearch, show]);

  return { saveSearchLabel, isCurrentSaved, handleSaveSearch };
}
