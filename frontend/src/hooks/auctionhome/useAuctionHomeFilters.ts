import React, { useCallback, useState } from 'react';
import { haptics } from '../../utils/haptics';
import type { AuctionScope } from '../../services/marketApi';
import {
  DEFAULT_BROWSE_STATE,
  type AuctionBrowseState } from '../../utils/auctionHomeLogic';

export interface UseAuctionHomeFiltersResult {
  browseState: AuctionBrowseState;
  setBrowseState: React.Dispatch<React.SetStateAction<AuctionBrowseState>>;
  filterSheetVisible: boolean;
  setFilterSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  draftBrowse: AuctionBrowseState;
  setDraftBrowse: React.Dispatch<React.SetStateAction<AuctionBrowseState>>;
  openFilterSheet: () => void;
  applyDraftFilters: () => void;
  resetDraftFilters: () => void;
  clearAllFilters: () => void;
  setScope: (scope: AuctionScope) => void;
  removeFilterChip: (chipType: 'sort' | 'category' | 'priceMin' | 'priceMax' | 'query', value?: string) => void;
}

/**
 * Canonical browse state (one taxonomy, not three) plus the filter-sheet
 * draft lifecycle and every mutating handler. All haptics live here so the
 * screen stays declarative.
 */
export function useAuctionHomeFilters(): UseAuctionHomeFiltersResult {
  const [browseState, setBrowseState] = useState<AuctionBrowseState>(DEFAULT_BROWSE_STATE);

  // ── Filter sheet ──
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [draftBrowse, setDraftBrowse] = useState<AuctionBrowseState>(DEFAULT_BROWSE_STATE);

  const openFilterSheet = useCallback(() => {
    setDraftBrowse(browseState);
    setFilterSheetVisible(true);
  }, [browseState]);

  const applyDraftFilters = useCallback(() => {
    haptics.tap();
    setBrowseState(draftBrowse);
    setFilterSheetVisible(false);
  }, [draftBrowse]);

  const resetDraftFilters = useCallback(() => {
    haptics.tap();
    setDraftBrowse({ ...DEFAULT_BROWSE_STATE, scope: draftBrowse.scope });
  }, [draftBrowse.scope]);

  const clearAllFilters = useCallback(() => {
    haptics.tap();
    setBrowseState((prev) => ({ ...DEFAULT_BROWSE_STATE, scope: prev.scope }));
  }, []);

  const setScope = useCallback((scope: AuctionScope) => {
    haptics.selection();
    setBrowseState((prev) => ({ ...prev, scope }));
  }, []);

  const removeFilterChip = useCallback((chipType: 'sort' | 'category' | 'priceMin' | 'priceMax' | 'query', value?: string) => {
    haptics.tap();
    setBrowseState((prev) => {
      if (chipType === 'sort') return { ...prev, sort: 'recommended' };
      if (chipType === 'category') return { ...prev, categories: prev.categories.filter((c) => c !== value) };
      if (chipType === 'priceMin') return { ...prev, priceMin: undefined };
      if (chipType === 'priceMax') return { ...prev, priceMax: undefined };
      if (chipType === 'query') return { ...prev, query: undefined };
      return prev;
    });
  }, []);

  return {
    browseState,
    setBrowseState,
    filterSheetVisible,
    setFilterSheetVisible,
    draftBrowse,
    setDraftBrowse,
    openFilterSheet,
    applyDraftFilters,
    resetDraftFilters,
    clearAllFilters,
    setScope,
    removeFilterChip };
}
