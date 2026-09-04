/**
 * useDynamicAlgorithmSignals Hook
 *
 * Reactive hook that drives in-feed quick signal chips on HomeScreen,
 * category & style bars in Discover, and suggestions in Search & Browse.
 * Fuses the user's active algorithm profile, recommendation items,
 * and implicit browsing vectors into ranked dynamic signals.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useForYouFeed } from './useForYouFeed';
import { useTaxonomy } from '../context/TaxonomyContext';
import {
  deriveDynamicSignals,
  boostAlgorithmicSignal,
  matchesSignal,
  CURATED_BASELINE_SIGNALS,
  normalizeFilterKey,
  type DynamicSignalChip,
} from '../services/algorithmicSignalsService';
import {
  fetchAlgorithmProfile,
  type AlgorithmTransparencyProfile,
} from '../services/algorithmTransparencyApi';
import { loadRecentSearchStrings } from '../services/searchHistory';

export interface UseDynamicAlgorithmSignalsOptions {
  surface?: 'home' | 'discover' | 'search' | 'discovery' | 'browse';
  initialSignalKey?: string;
  onSelectSignal?: (signal: DynamicSignalChip) => void;
}

export function useDynamicAlgorithmSignals(options: UseDynamicAlgorithmSignalsOptions = {}) {
  const { surface = 'home', initialSignalKey = 'all', onSelectSignal } = options;

  const currentUser = useStore((state) => state.currentUser);
  const wishlist = useStore((state) => state.wishlist);
  const { listings } = useBackendData();
  const forYouFeed = useForYouFeed();
  const { categories: taxonomyCategories } = useTaxonomy();

  const [profile, setProfile] = useState<AlgorithmTransparencyProfile | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [activeSignalKey, setActiveSignalKey] = useState<string>(initialSignalKey);

  // Load algorithm transparency profile
  const loadProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const prof = await fetchAlgorithmProfile();
      setProfile(prof);
    } catch {
      setProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, currentUser?.id]);

  // Load recent searches
  useEffect(() => {
    loadRecentSearchStrings(currentUser?.id)
      .then(setRecentSearches)
      .catch(() => setRecentSearches([]));
  }, [currentUser?.id]);

  // Extract brand affinities from user's wishlist
  const wishlistBrands = useMemo(() => {
    if (!wishlist || wishlist.length === 0) return [];
    const brands = listings
      .filter((l) => wishlist.includes(l.id) && l.brand)
      .map((l) => l.brand as string);
    return Array.from(new Set(brands));
  }, [wishlist, listings]);

  // Derive ranked signals
  const signals = useMemo<DynamicSignalChip[]>(() => {
    return deriveDynamicSignals({
      profile,
      recommendationItems: forYouFeed.items,
      taxonomyCategories,
      recentSearches,
      wishlistBrands,
      surface,
    });
  }, [profile, forYouFeed.items, taxonomyCategories, recentSearches, wishlistBrands, surface]);

  // Identify the currently selected chip
  const activeSignal = useMemo<DynamicSignalChip>(() => {
    const normalizedKey = normalizeFilterKey(activeSignalKey);
    const found = signals.find((s) => s.filterKey === normalizedKey || s.label.toLowerCase() === normalizedKey);
    return found || signals[0] || CURATED_BASELINE_SIGNALS[0];
  }, [signals, activeSignalKey]);

  // Closed-loop selection and boost
  const selectSignal = useCallback(
    (chip: DynamicSignalChip) => {
      setActiveSignalKey(chip.filterKey);
      void boostAlgorithmicSignal(currentUser?.id ?? null, chip);
      onSelectSignal?.(chip);
    },
    [currentUser?.id, onSelectSignal],
  );

  const selectSignalByKey = useCallback(
    (key: string) => {
      const normalized = normalizeFilterKey(key);
      const found = signals.find((s) => s.filterKey === normalized || s.label.toLowerCase() === normalized);
      if (found) {
        selectSignal(found);
      } else {
        setActiveSignalKey(key);
      }
    },
    [signals, selectSignal],
  );

  // Match predicate for filtering listings
  const matchesCurrentSignal = useCallback(
    (item: any): boolean => {
      return matchesSignal(item, activeSignal);
    },
    [activeSignal],
  );

  const isPersonalized = useMemo(() => {
    return signals.some((s) => s.isPersonalized && s.kind !== 'all');
  }, [signals]);

  return {
    signals,
    activeSignal,
    activeSignalKey,
    setActiveSignalKey: selectSignalByKey,
    selectSignal,
    matchesCurrentSignal,
    isPersonalized,
    isLoading: isLoadingProfile || forYouFeed.isLoading,
    refreshSignals: loadProfile,
  };
}
