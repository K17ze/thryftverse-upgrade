import { useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';

interface Params {
  imageUri: string | null;
  description: string;
  selectedCategory: string | null;
  brand: string;
  minPrice: string;
  maxPrice: string;
}

// Save-search domain for VisualSearchScreen: derives the saved-search label,
// detects whether the current scope is already saved, and persists the
// text/facet filters truthfully. Visual query images are not yet persisted
// as a durable query representation, so alerts are disabled — enabling
// alerts on a visual search with no retained image would be deceptive (the
// alert would match on text/facets only, not the photo). When a retained
// visual-query contract exists, this can be upgraded to alertsEnabled: true
// with a clear disclosure.
export function useVisualSearchSaveSearch({
  imageUri,
  description,
  selectedCategory,
  brand,
  minPrice,
  maxPrice }: Params) {
  const haptic = useHaptic();
  const { show } = useToast();
  const addSavedSearch = useStore((state) => state.addSavedSearch);
  const savedSearches = useStore((state) => state.savedSearches);

  const saveSearchLabel = useMemo(() => {
    const parts: string[] = [];
    if (description.trim()) parts.push(description.trim());
    else if (selectedCategory) parts.push(selectedCategory);
    if (brand.trim()) parts.push(brand.trim());
    return parts.join(' · ') || 'Visual search';
  }, [description, selectedCategory, brand]);

  const isCurrentSaved = useMemo(() => {
    return savedSearches.some(
      (s) =>
        s.query === saveSearchLabel &&
        (s.filters.category ?? '') === (selectedCategory ?? '') &&
        s.filters.brands.join(',') === (brand.trim() ? [brand.trim()].join(',') : '')
    );
  }, [savedSearches, saveSearchLabel, selectedCategory, brand]);

  const handleSaveSearch = useCallback(() => {
    if (!imageUri) return;
    haptic.success();
    const minPriceNum = minPrice.trim() ? Number(minPrice) : undefined;
    const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : undefined;
    addSavedSearch({
      query: saveSearchLabel,
      filters: {
        brands: brand.trim() ? [brand.trim()] : [],
        sizes: [],
        condition: 'Any',
        sort: 'Newest',
        category: selectedCategory ?? undefined,
        minPrice: typeof minPriceNum === 'number' && !Number.isNaN(minPriceNum) ? minPriceNum : undefined,
        maxPrice: typeof maxPriceNum === 'number' && !Number.isNaN(maxPriceNum) ? maxPriceNum : undefined },
      alertsEnabled: false });
    show('Search saved (alerts off)', 'success');
  }, [imageUri, saveSearchLabel, brand, selectedCategory, minPrice, maxPrice, addSavedSearch, show, haptic]);

  return {
    isCurrentSaved,
    handleSaveSearch };
}
