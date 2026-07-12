import { useMemo } from 'react';
import { Listing } from '../data/mockData';

/**
 * Sold comparables for pricing guidance.
 * Derived from real backend listings data — no fabricated numbers.
 */
export interface SoldCompsResult {
  /** Minimum sold price in the comparable set */
  minPrice: number | null;
  /** Maximum sold price in the comparable set */
  maxPrice: number | null;
  /** Median sold price */
  medianPrice: number | null;
  /** Number of sold items in the comparable set */
  sampleSize: number;
  /** Whether there are enough comparables to show guidance (≥2) */
  hasComps: boolean;
}

/**
 * Computes sold comparables from backend listings filtered by category and/or brand.
 * Only returns data when there are ≥2 sold items matching — otherwise returns nulls
 * so the UI can truthfully show nothing rather than fabricate a range.
 *
 * @param listings All backend listings (from useBackendData)
 * @param category Optional category filter
 * @param brand Optional brand filter
 */
export function useSoldComps(
  listings: Listing[],
  category?: string,
  brand?: string
): SoldCompsResult {
  return useMemo(() => {
    if (!category && !brand) {
      return { minPrice: null, maxPrice: null, medianPrice: null, sampleSize: 0, hasComps: false };
    }

    const sold = listings.filter((l) => {
      if (!l.isSold) return false;
      const categoryMatch = category ? l.category === category : true;
      const brandMatch = brand ? l.brand === brand : true;
      return categoryMatch && brandMatch;
    });

    if (sold.length < 2) {
      return { minPrice: null, maxPrice: null, medianPrice: null, sampleSize: sold.length, hasComps: false };
    }

    const prices = sold.map((l) => l.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

    return {
      minPrice: prices[0],
      maxPrice: prices[prices.length - 1],
      medianPrice: median,
      sampleSize: sold.length,
      hasComps: true,
    };
  }, [listings, category, brand]);
}
