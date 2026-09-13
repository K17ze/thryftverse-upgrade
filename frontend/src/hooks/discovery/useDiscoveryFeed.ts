import { useMemo } from 'react';

import { useBackendData } from '../../context/BackendDataContext';
import { useForYouFeed } from '../useForYouFeed';
import { matchesSignal, type DynamicSignalChip } from '../../services/algorithmicSignalsService';
import { assembleDiscoveryFeed } from '../../utils/discoveryFeedAssembly';
import type { LookApiItem } from '../../services/looksApi';
import type { PosterStory } from '../../services/postersApi';
import type { Moodboard } from '../../services/moodboardApi';

interface UseDiscoveryFeedInput {
  activeCategory: string;
  activeSignalChip: DynamicSignalChip;
  looks: LookApiItem[];
  posters: PosterStory[];
  moodboards: Moodboard[];
  isDiscoveryLoading: boolean;
  discoveryError: string | null;
}

/**
 * Owns the personalised listing pipeline for the discovery feed:
 * For You listings fall back to the backend cursor, the active category
 * chip filters/sorts them, and assembleDiscoveryFeed interleaves the
 * creator modules (looks / posters / moodboards) into the masonry units.
 * Also derives the surface state flags (loading skeleton, error, empty,
 * filtered-empty) the view switches on.
 */
export function useDiscoveryFeed({
  activeCategory,
  activeSignalChip,
  looks,
  posters,
  moodboards,
  isDiscoveryLoading,
  discoveryError }: UseDiscoveryFeedInput) {
  const { listings: backendListings, refreshListings, isSyncing, lastError } = useBackendData();
  const forYouFeed = useForYouFeed('discovery');

  // ── Personalised listings: For You feed when available, else backend cursor ──
  const baseListings = useMemo(() => {
    if (forYouFeed.listings.length > 0) return forYouFeed.listings;
    return backendListings;
  }, [forYouFeed.listings, backendListings]);

  // ── Category filter — dynamically matches category, brand, style or recency ──
  const personalisedListings = useMemo(() => {
    if (activeCategory === 'All') return baseListings;
    if (activeCategory === 'New') {
      // Sort by createdAt descending, take recent items
      return [...baseListings].sort((a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
    }
    return baseListings.filter((listing) => matchesSignal(listing, activeSignalChip));
  }, [baseListings, activeCategory, activeSignalChip]);

  // ── Assemble the heterogeneous discovery feed ──
  const feedUnits = useMemo(
    () => assembleDiscoveryFeed(
      personalisedListings,
      2,
      { looks, posters, moodboards },
    ),
    [personalisedListings, looks, posters, moodboards],
  );

  const hasAnyContent = personalisedListings.length > 0 || looks.length > 0 || posters.length > 0 || moodboards.length > 0;
  const showLoadingSkeleton = !hasAnyContent && (isDiscoveryLoading || forYouFeed.isLoading || (isSyncing && !lastError));
  const showError = !hasAnyContent && (Boolean(lastError) || Boolean(discoveryError)) && !isSyncing && !isDiscoveryLoading && !forYouFeed.isLoading;
  const showEmpty = !hasAnyContent && !isSyncing && !lastError && !isDiscoveryLoading && !forYouFeed.isLoading;
  // Filtered-empty: a category pill is selected but returns 0 listings. This
  // is distinct from the generic empty state (no data at all) — here we have
  // data, just none matching the selected category. Takes precedence over
  // showEmpty so the user gets a contextual message + "Browse all" action.
  const showFilteredEmpty =
    activeCategory !== 'All' &&
    personalisedListings.length === 0 &&
    !showLoadingSkeleton &&
    !showError;

  return {
    forYouFeed,
    refreshListings,
    feedUnits,
    hasAnyContent,
    showLoadingSkeleton,
    showError,
    showEmpty,
    showFilteredEmpty,
  };
}
