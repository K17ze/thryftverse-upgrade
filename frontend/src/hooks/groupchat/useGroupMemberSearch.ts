/**
 * useGroupMemberSearch — debounced member search state for the
 * create-group flow. Extracted verbatim from CreateGroupChatScreen:
 * same SEARCH_DEBOUNCE_MS debounce, same minimum-2-character rule,
 * same error mapping via parseApiError.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchUsers } from '../../services/profileApi';
import { parseApiError } from '../../lib/apiClient';
import { SEARCH_DEBOUNCE_MS } from '../../utils/chatGroupHelpers';
import type { SelectableUser } from '../../utils/chatGroupHelpers';

export interface GroupMemberSearchResult {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SelectableUser[];
  isSearching: boolean;
  hasSearched: boolean;
  searchError: string;
  performSearch: (query: string) => Promise<void>;
}

export function useGroupMemberSearch(
  currentUserId: string | undefined,
): GroupMemberSearchResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<SelectableUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError('');
      return;
    }
    setIsSearching(true);
    setHasSearched(false);
    setSearchError('');
    try {
      const results = await searchUsers(trimmed, 20);
      const filtered = results
        .filter((r) => r.id !== currentUserId)
        .map((r) => ({ ...r, displayName: r.displayName, avatar: r.avatar }));
      setSearchResults(filtered);
      setHasSearched(true);
    } catch (err) {
      setSearchResults([]);
      setHasSearched(true);
      setSearchError(parseApiError(err, 'Search failed. Check your connection.').message);
    } finally {
      setIsSearching(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setSearchError('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void performSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, performSearch]);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    hasSearched,
    searchError,
    performSearch,
  };
}
