import { useMemo } from 'react';

import type { Listing } from '../../domain';
import type { BrowseFilterState } from '../../store/useStore';
import { matchesSignal } from '../../services/algorithmicSignalsService';
import type { DynamicSignalChip } from '../../services/algorithmicSignalsService';

const toKey = (value: string) => value.trim().toLowerCase();

function getSubcategoryToken(categoryId: string, subcategoryId?: string, title?: string) {
  if (subcategoryId) {
    return subcategoryId
      .toLowerCase()
      .replace(/^[^-]+-/, '')
      .replace(/-/g, ' ')
      .trim();
  }

  if (!title) {
    return '';
  }

  const loweredTitle = title.toLowerCase().replace(/["']/g, '').trim();
  if (loweredTitle.startsWith('all ')) {
    return '';
  }

  const cleanedCategoryId = categoryId.toLowerCase();
  if (loweredTitle.startsWith(cleanedCategoryId)) {
    return loweredTitle.slice(cleanedCategoryId.length).trim();
  }

  return loweredTitle;
}

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

    const baseList = listings.filter((listing) => {
      if (normalizedCategory !== 'search' && listing.category?.toLowerCase() !== normalizedCategory) {
        return false;
      }

      if (normalizedCategory !== 'search' && normalizedSubcategory) {
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
        sorted.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
    if (backendListings !== null) return backendListings;
    const base = dataToRender;
    if (!browseFilters.sustainableOnly) return base;
    return base.filter((listing) =>
      listing.sustainabilityGrade === 'A' || listing.sustainabilityGrade === 'B',
    );
  }, [backendListings, dataToRender, browseFilters.sustainableOnly]);

  return { dataToRender, displayListings, displayCount: displayListings.length };
}
