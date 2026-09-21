import { useState, useCallback, useMemo, useRef } from 'react';
import type { Listing } from '../../domain';
import { useBackendData } from '../../context/BackendDataContext';
import type { VisualSearchFilterPayload } from '../../components/visualsearch/visualSearchTypes';

// Multi-modal refinement domain for VisualSearchScreen: description text,
// category/brand/price filters and the F08 colour/style facet selections.
// Also owns the derived category rail data, brand suggestions, the filter
// payload sent to the backend, and the client-side cached-listings fallback
// filter (mirrors BrowseScreen logic).
/** The complete refinement-field snapshot the request payload is built
 *  from — kept in a ref so payload builders read the values that were
 *  committed most recently, not the render their closure came from. */
interface VisualSearchFilterSnapshot {
  description: string;
  selectedCategory: string | null;
  brand: string;
  minPrice: string;
  maxPrice: string;
  selectedColor: string | null;
  selectedStyle: string | null;
}

const EMPTY_FILTER_SNAPSHOT: VisualSearchFilterSnapshot = {
  description: '',
  selectedCategory: null,
  brand: '',
  minPrice: '',
  maxPrice: '',
  selectedColor: null,
  selectedStyle: null };

export function useVisualSearchFilters() {
  const { listings } = useBackendData();

  const [description, setDescriptionState] = useState('');
  const [selectedCategory, setSelectedCategoryState] = useState<string | null>(null);
  const [brand, setBrandState] = useState('');
  const [minPrice, setMinPriceState] = useState('');
  const [maxPrice, setMaxPriceState] = useState('');
  const [selectedColor, setSelectedColorState] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyleState] = useState<string | null>(null);

  // ── Payload source-of-truth (P1-3) ──
  // buildFilterPayload/filterCachedListings read this ref, not render
  // state. Every setter writes it SYNCHRONOUSLY before scheduling the
  // state update, so a re-search dispatched from a stale closure — e.g.
  // "Clear filters" calling a runSearch captured before the clear — still
  // builds the payload for the filters the user actually sees. This is
  // the same convention the crop path uses for regionRef in
  // useVisualSearchResults: the committed value lives in a ref precisely
  // because a captured async entry point can outlive its render.
  const filtersRef = useRef<VisualSearchFilterSnapshot>({ ...EMPTY_FILTER_SNAPSHOT });
  const setDescription = useCallback((v: string) => {
    filtersRef.current.description = v;
    setDescriptionState(v);
  }, []);
  const setSelectedCategory = useCallback((v: string | null) => {
    filtersRef.current.selectedCategory = v;
    setSelectedCategoryState(v);
  }, []);
  const setBrand = useCallback((v: string) => {
    filtersRef.current.brand = v;
    setBrandState(v);
  }, []);
  const setMinPrice = useCallback((v: string) => {
    filtersRef.current.minPrice = v;
    setMinPriceState(v);
  }, []);
  const setMaxPrice = useCallback((v: string) => {
    filtersRef.current.maxPrice = v;
    setMaxPriceState(v);
  }, []);
  const setSelectedColor = useCallback((v: string | null) => {
    filtersRef.current.selectedColor = v;
    setSelectedColorState(v);
  }, []);
  const setSelectedStyle = useCallback((v: string | null) => {
    filtersRef.current.selectedStyle = v;
    setSelectedStyleState(v);
  }, []);

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
    const f = filtersRef.current;
    const minPriceNum = f.minPrice.trim() ? Number(f.minPrice) : undefined;
    const maxPriceNum = f.maxPrice.trim() ? Number(f.maxPrice) : undefined;
    return {
      query: f.description.trim() || undefined,
      category: f.selectedCategory ?? undefined,
      brand: f.brand.trim() || undefined,
      minPrice: typeof minPriceNum === 'number' && !Number.isNaN(minPriceNum) ? minPriceNum : undefined,
      maxPrice: typeof maxPriceNum === 'number' && !Number.isNaN(maxPriceNum) ? maxPriceNum : undefined,
      // F08: facets are retrieval parameters sent to the backend so the
      // candidate set is narrowed server-side before ranking.
      facets:
        f.selectedColor || f.selectedStyle
          ? { color: f.selectedColor ?? undefined, style: f.selectedStyle ?? undefined }
          : undefined,
      sort: 'similarity' as const,
      limit: 48 };
  }, []);

  // Client-side fallback filter over cached listings — mirrors BrowseScreen logic.
  const filterCachedListings = useCallback(
    (payload: VisualSearchFilterPayload): Listing[] => {
      const q = (payload.query ?? '').trim().toLowerCase();
      const cat = (payload.category ?? '').trim().toLowerCase();
      const b = (payload.brand ?? '').trim().toLowerCase();
      const min = payload.minPrice;
      const max = payload.maxPrice;
      const colorFilter = filtersRef.current.selectedColor?.toLowerCase() ?? '';
      const styleFilter = filtersRef.current.selectedStyle?.toLowerCase() ?? '';

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
    [listings]
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
  // The ref is reset synchronously BEFORE the state updates are scheduled,
  // so a runSearch invoked from a pre-clear closure still dispatches the
  // cleared payload (P1-3 — the stale-closure fix, mirroring regionRef).
  const clearFields = useCallback(() => {
    filtersRef.current = { ...EMPTY_FILTER_SNAPSHOT };
    setDescriptionState('');
    setSelectedCategoryState(null);
    setBrandState('');
    setMinPriceState('');
    setMaxPriceState('');
    setSelectedColorState(null);
    setSelectedStyleState(null);
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
