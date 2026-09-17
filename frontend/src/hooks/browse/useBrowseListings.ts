import { useMemo } from 'react';

import type { Listing } from '../../domain';
import type { BrowseFilterState } from '../../store/useStore';
import { matchesSignal } from '../../services/algorithmicSignalsService';
import type { DynamicSignalChip } from '../../services/algorithmicSignalsService';
import { getSubcategoryToken } from '../../utils/subcategoryToken';

const toKey = (value: string) => value.trim().toLowerCase();

interface UseBrowseListingsOptions {
  listings: Listing[];
  backendListings: Listing[] | null;
  browseFilters: BrowseFilterState;
  categoryId: string;
  subcategoryId?: string;
  title: string;
  activeSignal: DynamicSignalChip;
}

/**
 * Client-side filter/sort/signal pipeline for BrowseScreen. `dataToRender`
 * applies category, subcategory, query, brand, size, condition, price and
 * sustainability filters plus the selected sort and the active algorithmic
 * signal; `displayListings` prefers backend-filtered results when present.
 * Extracted verbatim — ordering and fail-closed sustainability semantics
 * preserved.
 */
export function useBrowseListings({
  listings,
  backendListings,
  browseFilters,
  categoryId,
  subcategoryId,
  title,
  activeSignal }: UseBrowseListingsOptions) {
  const dataToRender = useMemo(() => {
    const normalizedCategory = toKey(categoryId);
    const normalizedSubcategory = getSubcategoryToken(categoryId, subcategoryId, title);
    const normalizedQuery = browseFilters.query.trim().toLowerCase();
    const selectedBrands = new Set(browseFilters.brands.map((brand) => brand.toLowerCase()));
    const selectedSizes = new Set(browseFilters.sizes.map((size) => size.toLowerCase()));

    // 'search' and 'all' are unscoped browse modes — no real category is
    // literally "all", so applying the category/subcategory predicates there
    // rejected every listing and rendered the grid permanently empty.
    const isUnscopedCategory =
      normalizedCategory === 'search' || normalizedCategory === 'all';

    const baseList = listings.filter((listing) => {
      if (!isUnscopedCategory && listing.category?.toLowerCase() !== normalizedCategory) {
        return false;
      }

      if (!isUnscopedCategory && normalizedSubcategory) {
        return listing.subcategory?.toLowerCase()?.includes(normalizedSubcategory) ?? false;
      }

      return true;
    });

    const filteredList = baseList.filter((listing) => {
      if (normalizedQuery) {
        const searchable = [
          listing.title,
          listing.brand,
          listing.description,
          listing.category,
          listing.subcategory,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable?.includes(normalizedQuery)) {
          return false;
        }
      }

      if (selectedBrands.size > 0 && !selectedBrands.has(listing.brand?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedSizes.size > 0 && !selectedSizes.has(listing.size?.toLowerCase() ?? '')) {
        return false;
      }

      if (browseFilters.condition !== 'Any' && listing.condition !== browseFilters.condition) {
        return false;
      }

      // Price range filter (GBP)
      if (browseFilters.priceMin != null && listing.price < browseFilters.priceMin) return false;
      if (browseFilters.priceMax != null && listing.price > browseFilters.priceMax) return false;

      // Sustainable — fail-closed: when the backend has no emissions data
      // the grade is null, so the item does not pass the sustainable filter.
      if (
        browseFilters.sustainableOnly &&
        !(listing.sustainabilityGrade === 'A' || listing.sustainabilityGrade === 'B')
      ) {
        return false;
      }

      return true;
    });

    const sorted = [...filteredList];
    switch (browseFilters.sort) {
      case 'Price: Low to High':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'Price: High to Low':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'Newest':
        sorted.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      case 'Most liked':
        sorted.sort((a, b) => b.likes - a.likes);
        break;
      case 'Ending soon':
        // Order by real auction end time; listings without a live auction
        // sink to the end rather than masquerading as ending soon.
        sorted.sort((a, b) => {
          const aDate = a.auctionEndsAt ? new Date(a.auctionEndsAt).getTime() : Infinity;
          const bDate = b.auctionEndsAt ? new Date(b.auctionEndsAt).getTime() : Infinity;
          return aDate - bDate;
        });
        break;
      case 'Recommended':
      default:
        sorted.sort((a, b) => b.likes - a.likes);
        break;
    }

    if (activeSignal.filterKey !== 'all') {
      return sorted.filter((listing) => matchesSignal(listing, activeSignal));
    }

    return sorted;
  }, [browseFilters, categoryId, listings, subcategoryId, title, activeSignal]);

  const displayListings = useMemo(() => {
    if (backendListings !== null) {
      // The backend request carries a single brand/size value; multi-select
      // selections are omitted from the request and applied here over the
      // returned page so every chosen option stays in effect.
      let result = backendListings;
      if (browseFilters.brands.length > 1) {
        const wanted = new Set(browseFilters.brands.map((b) => b.toLowerCase()));
        result = result.filter((l) => wanted.has(l.brand?.toLowerCase() ?? ''));
      }
      if (browseFilters.sizes.length > 1) {
        const wanted = new Set(browseFilters.sizes.map((s) => s.toLowerCase()));
        result = result.filter((l) => wanted.has(l.size?.toLowerCase() ?? ''));
      }
      // The listings table has no subcategory column — the predicate is a
      // client-side token match, so it must also run over backend results or
      // a subcategory browse silently shows the whole parent category.
      const subcategoryToken = getSubcategoryToken(categoryId, subcategoryId, title);
      const isUnscopedCategory = toKey(categoryId) === 'search' || toKey(categoryId) === 'all';
      if (!isUnscopedCategory && subcategoryToken) {
        result = result.filter(
          (l) => l.subcategory?.toLowerCase()?.includes(subcategoryToken) ?? false,
        );
      }
      if (browseFilters.sustainableOnly) {
        result = result.filter(
          (l) => l.sustainabilityGrade === 'A' || l.sustainabilityGrade === 'B',
        );
      }
      // Signal rail predicates are client-only (engagement heuristics) — the
      // backend path previously bypassed them, rendering the rail inert.
      if (activeSignal.filterKey !== 'all') {
        result = result.filter((l) => matchesSignal(l, activeSignal));
      }
      return result;
    }
    const base = dataToRender;
    if (!browseFilters.sustainableOnly) return base;
    return base.filter((listing) =>
      listing.sustainabilityGrade === 'A' || listing.sustainabilityGrade === 'B',
    );
  }, [backendListings, dataToRender, browseFilters.sustainableOnly, browseFilters.brands, browseFilters.sizes, categoryId, subcategoryId, title, activeSignal]);

  return { dataToRender, displayListings, displayCount: displayListings.length };
}
