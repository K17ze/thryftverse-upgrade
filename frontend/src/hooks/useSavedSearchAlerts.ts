import React from 'react';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import type { Listing } from '../data/mockData';

interface SavedSearchAlertResult {
  newMatches: number;
  searchId: string;
  query: string;
  matchedListingIds: string[];
}

/**
 * Checks all saved searches with alerts enabled against the current listings
 * in BackendDataContext. Returns the number of new matches per saved search
 * since the last check.
 *
 * This runs client-side as a polling mechanism — when the listings refresh
 * (via the BackendDataContext polling or pull-to-refresh), this hook
 * evaluates whether any new listings match saved search criteria.
 *
 * Matching logic:
 * - Query: case-insensitive substring match on title, brand, category, subcategory
 * - Brand filter: listing brand must be in the saved brands list
 * - Size filter: listing size must be in the saved sizes list
 * - Condition filter: listing condition must match (if not 'Any')
 *
 * The hook updates `lastCheckedAt` and `lastMatchCount` on each saved search
 * so the UI can show "N new" badges.
 */
export function useSavedSearchAlerts(): SavedSearchAlertResult[] {
  const savedSearches = useStore((s) => s.savedSearches);
  const updateSavedSearchMeta = useStore((s) => s.updateSavedSearchMeta);
  const { listings } = useBackendData();

  const results = React.useMemo<SavedSearchAlertResult[]>(() => {
    return savedSearches
      .filter((s) => s.alertsEnabled)
      .map((search) => {
        const matched = listings.filter((listing) => listingMatchesSearch(listing, search));
        const newMatchedIds = matched.map((l) => l.id);

        // Determine "new" matches by comparing against lastCheckedAt
        // If we have a lastCheckedAt, only count listings created after it
        let newCount = matched.length;
        if (search.lastCheckedAt) {
          const lastCheckedTs = Date.parse(search.lastCheckedAt);
          if (!Number.isNaN(lastCheckedTs)) {
            newCount = matched.filter((l) => {
              if (!l.createdAt) return false;
              const createdTs = Date.parse(l.createdAt);
              if (Number.isNaN(createdTs)) return false;
              return createdTs > lastCheckedTs;
            }).length;
          }
        }

        return {
          newMatches: newCount,
          searchId: search.id,
          query: search.query,
          matchedListingIds: newMatchedIds,
        };
      });
  }, [savedSearches, listings]);

  // Update the store with the latest match counts
  React.useEffect(() => {
    const now = new Date().toISOString();
    results.forEach((result) => {
      const search = savedSearches.find((s) => s.id === result.searchId);
      if (!search) return;
      // Only update if the count has changed or it's been more than 5 minutes
      if (search.lastMatchCount !== result.newMatches || !search.lastCheckedAt) {
        updateSavedSearchMeta(result.searchId, {
          lastCheckedAt: now,
          lastMatchCount: result.newMatches,
        });
      }
    });
  }, [results, savedSearches, updateSavedSearchMeta]);

  return results;
}

function listingMatchesSearch(
  listing: Listing,
  search: {
    query: string;
    filters: {
      brands: string[];
      sizes: string[];
      condition: string;
    };
  }
): boolean {
  const query = search.query.trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);

  // Query matching — all tokens must match somewhere
  if (tokens.length > 0) {
    const title = (listing.title ?? '').toLowerCase();
    const brand = (listing.brand ?? '').toLowerCase();
    const category = (listing.category ?? '').toLowerCase();
    const subcategory = (listing.subcategory ?? '').toLowerCase();
    const description = (listing.description ?? '').toLowerCase();

    const allMatch = tokens.every((token) =>
      title.includes(token) ||
      brand.includes(token) ||
      category.includes(token) ||
      subcategory.includes(token) ||
      description.includes(token)
    );
    if (!allMatch) return false;
  }

  // Brand filter
  if (search.filters.brands.length > 0) {
    const listingBrand = (listing.brand ?? '').toLowerCase();
    const brandMatch = search.filters.brands.some(
      (b) => listingBrand.includes(b.toLowerCase())
    );
    if (!brandMatch) return false;
  }

  // Size filter
  if (search.filters.sizes.length > 0) {
    const listingSize = (listing.size ?? '').toLowerCase();
    const sizeMatch = search.filters.sizes.some(
      (s) => listingSize.includes(s.toLowerCase())
    );
    if (!sizeMatch) return false;
  }

  // Condition filter
  if (search.filters.condition && search.filters.condition !== 'Any') {
    if (listing.condition !== search.filters.condition) return false;
  }

  return true;
}
