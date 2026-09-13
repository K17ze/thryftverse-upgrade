import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useStore } from '../../store/useStore';
import { getSortOptions } from '../../components/browse/sortOptions';

const BROWSE_SORT_PREF_KEY = 'thryftverse:browse-sort-pref:v1';

/**
 * Sort dropdown state + persisted sort preference for BrowseScreen.
 * Restores the stored sort on mount when it is valid for the current
 * category/search context, and persists every selection. Extracted verbatim
 * from BrowseScreen.
 */
export function useBrowseSortMenu(categoryId: string, searchQuery?: string) {
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const handleSortSelect = useCallback((sortValue: string) => {
    updateBrowseFilters({ sort: sortValue as any });
    setSortMenuOpen(false);
    AsyncStorage.setItem(BROWSE_SORT_PREF_KEY, sortValue).catch(() => {});
  }, [updateBrowseFilters]);

  useEffect(() => {
    AsyncStorage.getItem(BROWSE_SORT_PREF_KEY).then((stored) => {
      if (stored && getSortOptions(categoryId, searchQuery).some((opt) => opt.value === stored)) {
        updateBrowseFilters({ sort: stored as any });
      }
    }).catch(() => {});
  }, [updateBrowseFilters, categoryId, searchQuery]);

  return { sortMenuOpen, setSortMenuOpen, handleSortSelect };
}
