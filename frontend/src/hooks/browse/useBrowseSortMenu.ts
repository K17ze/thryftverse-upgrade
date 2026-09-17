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
 *
 * Writes target this surface's context bucket explicitly so an async
 * preference restore can never clobber a sort staged on another surface.
 */
export function useBrowseSortMenu(categoryId: string, searchQuery: string | undefined, contextKey: string) {
  const updateForContext = useStore((state) => state.updateBrowseFiltersForContext);

  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const handleSortSelect = useCallback((sortValue: string) => {
    updateForContext(contextKey, { sort: sortValue as any });
    setSortMenuOpen(false);
    AsyncStorage.setItem(BROWSE_SORT_PREF_KEY, sortValue).catch(() => {});
  }, [updateForContext, contextKey]);

  useEffect(() => {
    AsyncStorage.getItem(BROWSE_SORT_PREF_KEY).then((stored) => {
      if (!stored || !getSortOptions(categoryId, searchQuery).some((opt) => opt.value === stored)) {
        return;
      }
      // Only restore when nothing is staged in this context — the async read
      // resolves after mount and must not clobber a sort the user already
      // picked via the inline menu or an applied FilterScreen draft.
      const state = useStore.getState();
      const currentSort = state.browseFiltersByContext[contextKey]?.sort
        ?? (state.browseContextKey === contextKey ? state.browseFilters.sort : 'Recommended');
      if (currentSort === 'Recommended') {
        updateForContext(contextKey, { sort: stored as any });
      }
    }).catch(() => {});
  }, [updateForContext, categoryId, searchQuery, contextKey]);

  return { sortMenuOpen, setSortMenuOpen, handleSortSelect };
}
