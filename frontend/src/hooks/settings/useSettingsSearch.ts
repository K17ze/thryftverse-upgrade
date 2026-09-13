import React from 'react';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { ROUTE_METADATA, type DestinationMeta } from './settingsRouteMetadata';

export interface UseSettingsSearchResult {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isSearching: boolean;
  searchResults: DestinationMeta[];
  showAdvancedDeveloper: boolean;
}

/**
 * Inline settings search — the search field at the top of the settings list
 * filters destinations in-place against label, section and searchTerms
 * (fuzzy substring matching across all three fields).
 */
export function useSettingsSearch(): UseSettingsSearchResult {
  const { developerMode } = useSettingsPreferences();
  const [searchQuery, setSearchQuery] = React.useState('');

  const isSearching = searchQuery.trim().length > 0;
  const q = searchQuery.toLowerCase().trim();

  // ── Developer eligibility gate ──
  // The "Advanced" section is hidden from ordinary consumers.
  // It is revealed only when the user has enabled developer mode
  // (Settings → About → tap version 7 times). Per spec 18, developer mode
  // keeps only raw debugging tools — not consumer agent features, which now
  // live in the normal "Connected services" section above.
  const showAdvancedDeveloper = developerMode;

  const searchResults = React.useMemo(() => {
    if (!isSearching) return [];
    return ROUTE_METADATA.filter((d) => {
      // Hide Advanced routes from search when the section is gated.
      if (d.section === 'Advanced' && !showAdvancedDeveloper) return false;
      return (
        d.searchTerms.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.section.toLowerCase().includes(q)
      );
    });
  }, [isSearching, q, showAdvancedDeveloper]);

  return {
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    showAdvancedDeveloper,
  };
}
