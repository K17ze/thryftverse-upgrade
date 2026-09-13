import { useCallback, useMemo } from 'react';
import { useBackendData } from '../../context/BackendDataContext';
import type { StyleItem } from '../../services/styleGraph';
import {
  deriveBuilderScreenState,
  listingToStyleItem,
  type BuilderScreenState } from '../../components/outfitbuilder/outfitBuilderViewModels';

export interface UseOutfitBuilderDataResult extends BuilderScreenState {
  availableItems: StyleItem[];
  lastError: string | null;
  /** Re-runs the listings sync (offline banner + error-state retry). */
  handleRetry: () => void;
}

/**
 * Owns the builder's data domain: the closet listings feed, its conversion to
 * StyleItems, the loading / error / empty / populated state machine, and the
 * retry wiring. The screen stays a pure orchestrator.
 */
export function useOutfitBuilderData(): UseOutfitBuilderDataResult {
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();

  // Convert listings to StyleItems — mapping preserved verbatim.
  const availableItems = useMemo<StyleItem[]>(() => {
    return listings.map((l: any) => listingToStyleItem(l));
  }, [listings]);

  const { showLoading, showError, showEmpty, showContent } = useMemo(
    () => deriveBuilderScreenState({ isSyncing, lastError, listingsCount: listings.length }),
    [isSyncing, lastError, listings.length],
  );

  const handleRetry = useCallback(() => {
    refreshListings();
  }, [refreshListings]);

  return {
    availableItems,
    lastError,
    showLoading,
    showError,
    showEmpty,
    showContent,
    handleRetry };
}
