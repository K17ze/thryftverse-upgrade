import { useMemo } from 'react';
import type { Listing } from '../../domain';
import { isSustainableGrade } from '../../utils/sustainabilityScore';
import type { ConditionOption } from '../../components/filters/filterTypes';

interface Params {
  listings: Listing[];
  categoryId: string;
  subcategoryId?: string;
  title?: string;
  /** Persisted browse query — participates in the count, same as Apply does. */
  query: string;
  selectedBrands: string[];
  selectedSizes: string[];
  selectedCondition: ConditionOption;
  priceMin: string;
  priceMax: string;
  sustainableOnly: boolean;
}

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

// Client-side count of listings matching the current draft selection —
// mirrors the predicate applied on Apply. In search context this is only an
// approximation against the local snapshot; the header handles that honesty.
export function useFilterResultCount({
  listings,
  categoryId,
  subcategoryId,
  title,
  query,
  selectedBrands,
  selectedSizes,
  selectedCondition,
  priceMin,
  priceMax,
  sustainableOnly,
}: Params): number {
  return useMemo(() => {
    const normalizedCategory = toKey(categoryId);
    const normalizedSubcategory = getSubcategoryToken(categoryId, subcategoryId, title);
    const normalizedQuery = query.trim().toLowerCase();
    const selectedBrandKeys = new Set(selectedBrands.map((brand) => brand.toLowerCase()));
    const selectedSizeKeys = new Set(selectedSizes.map((size) => size.toLowerCase()));

    return listings.filter((listing) => {
      if (normalizedCategory !== 'search' && listing.category?.toLowerCase() !== normalizedCategory) {
        return false;
      }

      if (normalizedCategory !== 'search' && normalizedSubcategory) {
        if (!listing.subcategory?.toLowerCase()?.includes(normalizedSubcategory)) {
          return false;
        }
      }

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

      if (selectedBrandKeys.size > 0 && !selectedBrandKeys.has(listing.brand?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedSizeKeys.size > 0 && !selectedSizeKeys.has(listing.size?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedCondition !== 'Any' && listing.condition !== selectedCondition) {
        return false;
      }

      // Price range filter (GBP)
      const minVal = priceMin.trim() ? Number(priceMin.trim()) : null;
      const maxVal = priceMax.trim() ? Number(priceMax.trim()) : null;
      if (minVal != null && !Number.isNaN(minVal) && listing.price < minVal) return false;
      if (maxVal != null && !Number.isNaN(maxVal) && listing.price > maxVal) return false;

      // Sustainable — filters by seller-applied tags / heuristic grade.
      // Returns false in production (no real data), so the filter yields no
      // results until a backend impact service or seller tags exist.
      if (
        sustainableOnly &&
        !isSustainableGrade({
          condition: listing.condition,
          category: listing.category,
          subcategory: listing.subcategory,
          brand: listing.brand,
          sellerLocation: listing.seller?.location ?? null })
      ) {
        return false;
      }

      return true;
    }).length;
  }, [
    listings,
    categoryId,
    subcategoryId,
    title,
    query,
    selectedBrands,
    selectedSizes,
    selectedCondition,
    priceMin,
    priceMax,
    sustainableOnly,
  ]);
}
