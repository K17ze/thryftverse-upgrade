import { useState, useCallback, useMemo } from 'react';
import type { Listing } from '../../domain';
import { useBackendData } from '../../context/BackendDataContext';
import type { VisualSearchFilterPayload } from '../../components/visualsearch/visualSearchTypes';

// Multi-modal refinement domain for VisualSearchScreen: description text,
// category/brand/price filters and the F08 colour/style facet selections.
// Also owns the derived category rail data, brand suggestions, the filter
// payload sent to the backend, and the client-side cached-listings fallback
// filter (mirrors BrowseScreen logic).
export function useVisualSearchFilters() {
  const { listings } = useBackendData();

  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);

  // Derive available categories from listings for refinement chips.
  const availableCategories = useMemo(() => {
    const categoryMap = new Map<string, number>();
    for (const listing of listings) {
      const cat = (listing.category ?? '').trim();
      if (cat) {
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, count]) => ({ category, count }));
  }, [listings]);

  // Derive brand suggestions from listings (top brands).
  const brandSuggestions = useMemo(() => {
    const brandMap = new Map<string, number>();
    for (const listing of listings) {
      const b = (listing.brand ?? '').trim();
      if (b) {
        brandMap.set(b, (brandMap.get(b) ?? 0) + 1);
      }
    }
    return Array.from(brandMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([b]) => b);
  }, [listings]);

  const buildFilterPayload = useCallback((): VisualSearchFilterPayload => {
    const minPriceNum = minPrice.trim() ? Number(minPrice) : undefined;
    const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : undefined;
    return {
      query: description.trim() || undefined,
      category: selectedCategory ?? undefined,
      brand: brand.trim() || undefined,
      minPrice: typeof minPriceNum === 'number' && !Number.isNaN(minPriceNum) ? minPriceNum : undefined,
      maxPrice: typeof maxPriceNum === 'number' && !Number.isNaN(maxPriceNum) ? maxPriceNum : undefined,
      // F08: facets are retrieval parameters sent to the backend so the
      // candidate set is narrowed server-side before ranking.
      facets:
        selectedColor || selectedStyle
          ? { color: selectedColor ?? undefined, style: selectedStyle ?? undefined }
          : undefined,
      sort: 'similarity' as const,
      limit: 48 };
  }, [description, selectedCategory, brand, minPrice, maxPrice, selectedColor, selectedStyle]);

  // Client-side fallback filter over cached listings — mirrors BrowseScreen logic.
  const filterCachedListings = useCallback(
    (payload: VisualSearchFilterPayload): Listing[] => {
      const q = (payload.query ?? '').trim().toLowerCase();
      const cat = (payload.category ?? '').trim().toLowerCase();
      const b = (payload.brand ?? '').trim().toLowerCase();
      const min = payload.minPrice;
      const max = payload.maxPrice;
      const colorFilter = selectedColor?.toLowerCase() ?? '';
      const styleFilter = selectedStyle?.toLowerCase() ?? '';

      return listings.filter((listing) => {
        if (cat && (listing.category ?? '').toLowerCase() !== cat) return false;
        if (b && !(listing.brand ?? '').toLowerCase().includes(b)) return false;
        if (typeof min === 'number' && listing.price < min) return false;
        if (typeof max === 'number' && listing.price > max) return false;
        const searchable = [listing.title, listing.description, listing.brand, listing.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (colorFilter && !searchable.includes(colorFilter)) return false;
        if (styleFilter && !searchable.includes(styleFilter)) return false;
        if (q) {
          if (!searchable.includes(q)) return false;
        }
        return true;
      });
    },
    [listings, selectedColor, selectedStyle]
  );

  const hasActiveFilters =
    description.trim().length > 0 ||
    selectedCategory !== null ||
    brand.trim().length > 0 ||
    minPrice.trim().length > 0 ||
    maxPrice.trim().length > 0 ||
    selectedColor !== null ||
    selectedStyle !== null;

  // Clears every refinement field. Shared by "Clear filters" and the
  // remove-photo reset — neither side effects (haptics, re-search) live here.
  const clearFields = useCallback(() => {
    setDescription('');
    setSelectedCategory(null);
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
    setSelectedColor(null);
    setSelectedStyle(null);
  }, []);

  return {
    description,
    setDescription,
    selectedCategory,
    setSelectedCategory,
    brand,
    setBrand,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    selectedColor,
    setSelectedColor,
    selectedStyle,
    setSelectedStyle,
    availableCategories,
    brandSuggestions,
    buildFilterPayload,
    filterCachedListings,
    hasActiveFilters,
    clearFields };
}
